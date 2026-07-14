import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(user?: { sub: string; role: string; departmentIds: string[] }, filterDepartmentIds?: string[]) {
    const now = new Date();
    
    let linkWhere: any = {};
    let submissionWhere: any = {};

    if (user) {
      let allowedDepts = user.role === 'SUPER_ADMIN' ? null : (user.departmentIds || []);
      
      // Se houver filtro manual, intersectar com os permitidos
      let targetDepts = filterDepartmentIds && filterDepartmentIds.length > 0 ? filterDepartmentIds : allowedDepts;
      
      if (allowedDepts && filterDepartmentIds && filterDepartmentIds.length > 0) {
        targetDepts = filterDepartmentIds.filter(id => allowedDepts.includes(id));
      }

      if (targetDepts) {
        const deptFilter = { in: targetDepts };
        linkWhere = { template: { departmentId: deptFilter } };
        submissionWhere = { link: { template: { departmentId: deptFilter } } };
      }

      // Filtro global para esconder departamentos e modelos deletados (Soft Delete)
      const softDeleteFilter = {
        deletedAt: null,
        OR: [
          { departmentId: null },
          { department: { deletedAt: null } }
        ]
      };

      linkWhere.template = { ...(linkWhere.template || {}), ...softDeleteFilter };
      submissionWhere.link = { 
        ...(submissionWhere.link || {}), 
        template: { ...(submissionWhere.link?.template || {}), ...softDeleteFilter } 
      };

      if (user.role === 'OPERATOR') {
        linkWhere.createdById = user.sub;
        submissionWhere.link = { ...submissionWhere.link, createdById: user.sub };
      }
    }

    const [
      linksActive,
      linksTotal,
      signed,
      sentToSign,
      totalSubmissions,
      recentSubmissions,
      submissionsByStatus,
    ] = await Promise.all([
      this.prisma.publicLink.count({
        where: { ...linkWhere, revokedAt: null, expiresAt: { gt: now } },
      }),
      this.prisma.publicLink.count({ where: linkWhere }),
      this.prisma.submission.count({ where: { ...submissionWhere, status: 'signed' } }),
      this.prisma.submission.count({ where: { ...submissionWhere, status: 'sent_to_sign' } }),
      this.prisma.submission.count({ where: submissionWhere }),
      this.prisma.submission.findMany({
        where: submissionWhere,
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          formData: true,
          createdAt: true,
          documentUUID: true,
          link: { include: { template: { include: { department: true } } } },
        },
      }),
      this.prisma.submission.groupBy({
        by: ['status'],
        where: submissionWhere,
        _count: { status: true },
      }),
    ]);

    const statusMap = Object.fromEntries(
      submissionsByStatus.map((s) => [s.status, s._count.status]),
    );

    return {
      linksActive,
      linksTotal,
      signed,
      sentToSign,
      totalSubmissions,
      statusBreakdown: statusMap,
      recentSubmissions: recentSubmissions.map((s) => ({
        id: s.id,
        status: s.status,
        createdAt: s.createdAt,
        linkCreatedAt: s.link?.createdAt,
        token: s.link?.token,
        documentUUID: s.documentUUID,
        clientName: (() => {
          if (s.link?.clientName) return s.link.clientName;
          try {
            const data = JSON.parse(s.formData);
            return data['COMPANY_LEGAL_NAME'] || data['CLIENT_NAME'] || data['name'] || '—';
          } catch {
            return '—';
          }
        })(),
        templateName: s.link?.template?.name || '—',
        departmentName: s.link?.template?.department?.name || null,
      })),
    };
  }

  async getReportStats(user?: { role: string; departmentIds: string[] }, filterDepartmentIds?: string[]) {
    let linkWhere: any = {};
    let submissionWhere: any = {};

    let allowedDepts = user && user.role !== 'SUPER_ADMIN' ? (user.departmentIds || []) : null;
    let targetDepts = filterDepartmentIds && filterDepartmentIds.length > 0 ? filterDepartmentIds : allowedDepts;
    
    if (allowedDepts && filterDepartmentIds && filterDepartmentIds.length > 0) {
      targetDepts = filterDepartmentIds.filter(id => allowedDepts.includes(id));
    }

    if (targetDepts) {
      const deptFilter = { in: targetDepts };
      linkWhere = { template: { departmentId: deptFilter } };
      submissionWhere = { link: { template: { departmentId: deptFilter } } };
    }

    // Filtro global para esconder departamentos e modelos deletados (Soft Delete)
    const softDeleteFilter = {
      deletedAt: null,
      OR: [
        { departmentId: null },
        { department: { deletedAt: null } }
      ]
    };

    linkWhere.template = { ...(linkWhere.template || {}), ...softDeleteFilter };
    submissionWhere.link = { 
      ...(submissionWhere.link || {}), 
      template: { ...(submissionWhere.link?.template || {}), ...softDeleteFilter } 
    };

    const [
      totalLinks,
      linksAccessed,
      totalSubmissions,
      signedSubmissions,
      submissionsByStatus,
      dailySubmissions,
    ] = await Promise.all([
      this.prisma.publicLink.count({ where: linkWhere }),
      this.prisma.publicLink.count({ where: { ...linkWhere, accessCount: { gt: 0 } } }),
      this.prisma.submission.count({ where: submissionWhere }),
      this.prisma.submission.count({ where: { ...submissionWhere, status: 'signed' } }),
      this.prisma.submission.groupBy({
        by: ['status'],
        where: submissionWhere,
        _count: { id: true },
      }),
      this.prisma.$queryRawUnsafe(`
        SELECT date(Submission.createdAt) as date, count(*) as count 
        FROM Submission
        JOIN PublicLink ON Submission.linkId = PublicLink.id
        JOIN DocumentTemplate ON PublicLink.templateId = DocumentTemplate.id
        WHERE Submission.createdAt >= date('now', '-30 days')
        AND DocumentTemplate.deletedAt IS NULL
        ${targetDepts ? `AND DocumentTemplate.departmentId IN (${targetDepts.map(id => `'${id}'`).join(',')})` : ''}
        GROUP BY date(Submission.createdAt)
        ORDER BY date ASC
      `),
    ]);

    // Grouping by template name instead of link object
    const submissionsWithTemplate = await this.prisma.submission.findMany({
      where: submissionWhere,
      select: {
        link: {
          select: {
            template: {
              select: {
                name: true,
                department: { select: { name: true } },
              }
            }
          }
        }
      }
    });

    const templateCounts = submissionsWithTemplate.reduce((acc, curr) => {
      const name = curr.link?.template?.name || 'Sem Modelo';
      const department = curr.link?.template?.department?.name || null;
      const key = `${name}||${department ?? ''}`;
      if (!acc[key]) acc[key] = { name, department, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { name: string; department: string | null; count: number }>);

    return {
      funnel: {
        generated: totalLinks,
        accessed: linksAccessed,
        filled: totalSubmissions,
        signed: signedSubmissions,
      },
      byTemplate: Object.values(templateCounts),
      byStatus: submissionsByStatus.map(s => ({ status: s.status, count: s._count.id })),
      daily: dailySubmissions,
    };
  }

  async getReportItems(user?: { role: string; departmentIds: string[] }, filterDepartmentIds?: string[]) {
    let submissionWhere: any = {};

    let allowedDepts = user && user.role !== 'SUPER_ADMIN' ? (user.departmentIds || []) : null;
    let targetDepts = filterDepartmentIds && filterDepartmentIds.length > 0 ? filterDepartmentIds : allowedDepts;
    
    if (allowedDepts && filterDepartmentIds && filterDepartmentIds.length > 0) {
      targetDepts = filterDepartmentIds.filter(id => allowedDepts.includes(id));
    }

    if (targetDepts) {
      submissionWhere = { link: { template: { departmentId: { in: targetDepts }, deletedAt: null } } };
    } else {
      submissionWhere = { link: { template: { deletedAt: null } } };
    }

    const submissions = await this.prisma.submission.findMany({
      where: submissionWhere,
      include: {
        link: {
          include: {
            template: { include: { department: true } },
            batch: { select: { name: true } },
            createdBy: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return submissions.map((s) => {
      let client = s.link?.clientName || '—';
      try {
        const data = JSON.parse(s.formData);
        client = data['CLIENT_NAME'] || data['name'] || s.link?.clientName || '—';
      } catch {}

      return {
        id: s.id,
        date: s.createdAt,
        client,
        clientEmail: s.link?.clientEmail ?? null,
        template: s.link?.template?.name || '—',
        department: s.link?.template?.department?.name ?? null,
        status: s.status,
        batch: s.link?.batch?.name ?? null,
        createdBy: s.link?.createdBy?.name ?? null,
        expiresAt: s.link?.expiresAt ?? null,
        accessCount: s.link?.accessCount || 0,
        emailSent: s.link?.emailSentAt ?? null,
        lastError: s.lastError ?? null,
        token: s.link?.token ?? null,
        documentUUID: s.documentUUID ?? null,
      };
    });
  }
}
