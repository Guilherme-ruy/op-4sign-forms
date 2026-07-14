import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { D4SignService } from '../d4sign/d4sign.service';
import { DocgenService } from '../docgen/docgen.service';
import { EmailService } from '../email/email.service';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

type AuthUser = { sub: string; role: string };

// Cabeçalhos ("section") não têm responsável próprio: herdam o do primeiro
// campo de verdade abaixo deles na lista, pulando outros cabeçalhos pelo caminho.
function sectionRecipientOwner(
  allFields: { fieldType: string; recipientOrder: number | null }[],
  sectionIndex: number,
): number | null {
  for (let i = sectionIndex + 1; i < allFields.length; i++) {
    const f = allFields[i];
    if (f.fieldType === 'section') continue;
    if (f.recipientOrder != null) return f.recipientOrder;
  }
  return null;
}

@Injectable()
export class LinksService {
  private readonly logger = new Logger(LinksService.name);
  private readonly frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  constructor(
    private prisma: PrismaService,
    private d4sign: D4SignService,
    private docgen: DocgenService,
    private email: EmailService,
  ) {}

  async createLink(data: {
    templateId: string;
    clientName?: string;
    clientEmail?: string;
    additionalSigners?: string[];
    internalSigners?: string[];
    expiresInDays: number;
    createdById?: string;
    recipientAssignments?: { order: number; email: string; name?: string }[];
  }) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);

    const validExtra = (data.additionalSigners || []).filter((e) => e && e.includes('@'));
    const validInternal = (data.internalSigners || []).filter((e) => e && e.includes('@'));

    const link = await this.prisma.publicLink.create({
      data: {
        token: uuidv4(),
        templateId: data.templateId,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        additionalSigners: validExtra.length ? JSON.stringify(validExtra) : null,
        internalSigners: validInternal.length ? JSON.stringify(validInternal) : null,
        createdById: data.createdById ?? null,
        expiresAt,
      },
      include: {
        template: true,
        submissions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, createdAt: true, documentUUID: true } },
      },
    });

    // Multi-recipient flow: create RecipientSession per assignment
    if (data.recipientAssignments && data.recipientAssignments.length > 0) {
      const sorted = [...data.recipientAssignments].sort((a, b) => a.order - b.order);

      for (const assignment of sorted) {
        await this.prisma.recipientSession.create({
          data: {
            linkId: link.id,
            recipientOrder: assignment.order,
            email: assignment.email || null,
            name: assignment.name || null,
            token: uuidv4(),
          },
        });
      }

      // Send email only to the first recipient
      const first = sorted[0];
      if (first.email) {
        const firstSession = await this.prisma.recipientSession.findFirst({
          where: { linkId: link.id, recipientOrder: first.order },
        });
        if (firstSession) {
          try {
            const sent = await this.email.sendLinkEmail({
              to: { name: first.name || first.email, address: first.email },
              templateName: link.template.name,
              linkUrl: `${this.frontendUrl}/public/${firstSession.token}`,
              expiresAt,
            });
            if (sent) {
              await this.prisma.recipientSession.update({
                where: { id: firstSession.id },
                data: { emailSentAt: new Date() },
              });
            }
          } catch (err: any) {
            this.logger.error(`Erro ao enviar e-mail para primeiro responsável: ${err.message}`);
          }
        }
      }
    } else if (data.clientEmail) {
      // Original single-recipient email behavior
      try {
        const sent = await this.email.sendLinkEmail({
          to: { name: data.clientName || data.clientEmail, address: data.clientEmail },
          templateName: link.template.name,
          linkUrl: `${this.frontendUrl}/public/${link.token}`,
          expiresAt,
        });
        if (sent) {
          const emailSentAt = new Date();
          await this.prisma.publicLink.update({ where: { id: link.id }, data: { emailSentAt } });
          (link as any).emailSentAt = emailSentAt;
        }
      } catch (err: any) {
        this.logger.error(`Erro ao enviar e-mail: ${err.message}`);
      }
    }

    return link;
  }

  // ── where clause reutilizável entre listLinks e getStats ────────────
  private buildLinksWhere(
    user?: AuthUser & { departmentIds?: string[] },
    filterDepartmentIds?: string[],
    includeDeletedTemplates = false,
  ): any {
    let where: any = {};

    if (user) {
      const allowedDepts = user.role === 'SUPER_ADMIN' ? null : (user.departmentIds || []);
      let targetDepts = filterDepartmentIds?.length ? filterDepartmentIds : allowedDepts;

      if (allowedDepts && filterDepartmentIds?.length) {
        targetDepts = filterDepartmentIds.filter(id => allowedDepts.includes(id));
      }

      if (targetDepts) {
        where.template = { departmentId: { in: targetDepts } };
      }

      where.template = {
        ...(where.template || {}),
        OR: [
          { departmentId: null },
          { department: { deletedAt: null } },
        ],
      };

      if (user.role === 'OPERATOR') {
        where.createdById = user.sub;
      }
    }

    if (!includeDeletedTemplates) {
      where.template = { ...(where.template || {}), deletedAt: null };
    }

    return where;
  }

  async getStats(
    user?: AuthUser & { departmentIds?: string[] },
    filterDepartmentIds?: string[],
  ) {
    const where = this.buildLinksWhere(user, filterDepartmentIds);
    const now = new Date();

    const [total, active, waiting, signed] = await Promise.all([
      // total: todos os links visíveis pelo usuário
      this.prisma.publicLink.count({ where }),
      // ativos: não revogado, não expirado, sem nenhuma submissão
      this.prisma.publicLink.count({
        where: { ...where, revokedAt: null, expiresAt: { gt: now }, submissions: { none: {} } },
      }),
      // aguardando: link com submissão em sent_to_sign
      this.prisma.publicLink.count({
        where: { ...where, submissions: { some: { status: 'sent_to_sign' } } },
      }),
      // assinados: link com submissão em signed
      this.prisma.publicLink.count({
        where: { ...where, submissions: { some: { status: 'signed' } } },
      }),
    ]);

    return { total, active, waiting, signed };
  }

  async listLinks(page: number = 1, limit: number = 20, user?: AuthUser & { departmentIds?: string[] }, filterDepartmentIds?: string[], includeDeletedTemplates: boolean = false, findToken?: string) {
    let resolvedPage = page;
    const where = this.buildLinksWhere(user, filterDepartmentIds, includeDeletedTemplates);

    if (findToken) {
      const position = await this.prisma.publicLink.count({
        where: { ...where, createdAt: { gt: (await this.prisma.publicLink.findUnique({ where: { token: findToken }, select: { createdAt: true } }))?.createdAt ?? new Date(0) } },
      });
      resolvedPage = Math.ceil((position + 1) / limit) || 1;
    }

    const skip = (resolvedPage - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.publicLink.count({ where }),
      this.prisma.publicLink.findMany({
        where,
        skip,
        take: limit,
        include: {
          template: { include: { department: true } },
          batch: { select: { id: true, name: true } },
          submissions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, createdAt: true, documentUUID: true },
          },
          recipientSessions: {
            select: { recipientOrder: true, status: true, email: true, name: true, token: true, completedAt: true },
            orderBy: { recipientOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items,
      total,
      page: resolvedPage,
      limit,
      totalPages: Math.ceil(total / limit),
      ...(findToken ? { tokenPage: resolvedPage } : {}),
    };
  }

  async listBatches(user?: AuthUser) {
    const where = user?.role === 'OPERATOR'
      ? { links: { some: { createdById: user.sub } } }
      : {};

    return this.prisma.linkBatch.findMany({
      where,
      include: {
        template: { select: { id: true, name: true } },
        _count: { select: { links: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBatch(data: {
    name: string;
    templateId: string;
    expiresInDays: number;
    rows: { clientName: string; clientEmail: string; additionalSigners?: string[] }[];
    createdById?: string;
  }) {
    const batch = await this.prisma.linkBatch.create({
      data: { name: data.name, templateId: data.templateId },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);

    const template = await this.prisma.documentTemplate.findUnique({ where: { id: data.templateId } });

    const links = await Promise.all(
      data.rows.map(async (row) => {
        const link = await this.prisma.publicLink.create({
          data: {
            token: uuidv4(),
            templateId: data.templateId,
            batchId: batch.id,
            clientName: row.clientName || undefined,
            clientEmail: row.clientEmail || undefined,
            additionalSigners: row.additionalSigners?.length ? JSON.stringify(row.additionalSigners) : null,
            createdById: data.createdById ?? null,
            expiresAt,
          },
          include: {
            template: true,
            batch: { select: { id: true, name: true } },
            submissions: { take: 1, select: { id: true, status: true, createdAt: true, documentUUID: true } },
          },
        });

        if (row.clientEmail && template) {
          try {
            const sent = await this.email.sendLinkEmail({
              to: { name: row.clientName || row.clientEmail, address: row.clientEmail },
              templateName: template.name,
              linkUrl: `${this.frontendUrl}/public/${link.token}`,
              expiresAt,
            });
            if (sent) {
              const emailSentAt = new Date();
              await this.prisma.publicLink.update({ where: { id: link.id }, data: { emailSentAt } });
              (link as any).emailSentAt = emailSentAt;
            }
          } catch (err: any) {
            this.logger.error(`Erro ao enviar e-mail batch: ${err.message}`);
          }
        }

        return link;
      }),
    );

    return { batch, links };
  }

  async resendEmail(token: string) {
    const link = await this.prisma.publicLink.findUnique({
      where: { token },
      include: {
        template: true,
        submissions: { take: 1, select: { id: true } },
      },
    });

    if (!link) throw new Error('Link não encontrado.');
    if (!link.clientEmail) throw new Error('Este link não possui e-mail cadastrado.');
    if (link.revokedAt) throw new Error('Este link foi revogado e não pode receber reenvios.');
    if (link.expiresAt < new Date()) throw new Error('Este link está expirado. Crie um novo link para este destinatário.');
    if (link.submissions.length > 0) throw new Error('O formulário já foi preenchido. Não é possível reenviar o e-mail.');

    const sent = await this.email.sendLinkEmail({
      to: { name: link.clientName || link.clientEmail, address: link.clientEmail },
      templateName: link.template.name,
      linkUrl: `${this.frontendUrl}/public/${link.token}`,
      expiresAt: link.expiresAt,
    });

    if (!sent) throw new Error('Falha ao enviar o e-mail. Verifique as configurações do servidor SMTP.');

    const updated = await this.prisma.publicLink.update({
      where: { id: link.id },
      data: { emailSentAt: new Date() },
    });

    return { ok: true, emailSentAt: updated.emailSentAt };
  }

  async getLinkByToken(token: string) {
    // Multi-recipient path: check if token belongs to a RecipientSession
    const session = await this.prisma.recipientSession.findUnique({
      where: { token },
      include: { link: { include: { template: true } } },
    });

    if (session) {
      const link = session.link;
      if (link.expiresAt < new Date() || link.revokedAt) {
        throw new Error('Link inválido ou expirado');
      }
      if (session.status === 'completed') {
        const err: any = new Error('Você já preencheu esta etapa.');
        err.submissionStatus = 'completed';
        throw err;
      }

      const [recipient, totalRecipients] = await Promise.all([
        this.prisma.templateRecipient.findUnique({
          where: { templateId_order: { templateId: link.templateId, order: session.recipientOrder } },
        }),
        this.prisma.templateRecipient.count({ where: { templateId: link.templateId } }),
      ]);

      // If this recipient can see previous answers, load ALL preceding completed sessions
      type PrevAnswerField = {
        label: string; variableName: string; fieldType: string; value: string;
        groupId?: string; groupQuestion?: string; groupMaxSelections?: number;
        groupOptions?: { variableName: string; label: string; checked: boolean }[];
      };
      type PrevAnswerEntry = {
        recipientOrder: number;
        recipientLabel: string;
        recipientColor: string;
        prevSessionToken: string;
        fields: PrevAnswerField[];
        attachments: { slotLabel: string; slotId: string; filename: string; originalName: string }[];
      };
      let previousAnswers: PrevAnswerEntry[] = [];

      if (recipient?.canSeePreviousAnswers && session.recipientOrder > 1) {
        const [prevSessions, allRecipients, allFields, attachmentSlots] = await Promise.all([
          this.prisma.recipientSession.findMany({
            where: { linkId: link.id, recipientOrder: { lt: session.recipientOrder }, status: 'completed' },
            orderBy: { recipientOrder: 'asc' },
          }),
          this.prisma.templateRecipient.findMany({ where: { templateId: link.templateId }, orderBy: { order: 'asc' } }),
          this.prisma.templateField.findMany({
            where: { templateId: link.templateId },
            orderBy: { order: 'asc' },
          }),
          this.prisma.templateAttachment.findMany({
            where: { templateId: link.templateId, deletedAt: null },
            orderBy: { order: 'asc' },
          }),
        ]);

        for (const prevSession of prevSessions) {
          if (!prevSession.formData) continue;
          const prevOrder = prevSession.recipientOrder;
          const prevRecipient = allRecipients.find((r) => r.order === prevOrder);
          const prevData: Record<string, string> = JSON.parse(prevSession.formData);

          const recipientFields = allFields.filter((f, i) =>
            f.fieldType === 'section'
              ? sectionRecipientOwner(allFields, i) === prevOrder
              : f.recipientOrder === prevOrder || f.recipientOrder === null,
          );
          const processedGroups = new Set<string>();
          const fields: PrevAnswerField[] = [];
          let pendingSection: PrevAnswerField | null = null;

          for (const f of recipientFields) {
            if (f.fieldType === 'section') {
              pendingSection = { label: f.label, variableName: f.variableName, fieldType: 'section', value: '' };
              continue;
            }

            let grpMeta: { id: string; question: string; maxSelections: number } | null = null;
            if (f.fieldType === 'checkbox' && f.options) {
              try { grpMeta = JSON.parse(f.options)?.group ?? null; } catch {}
            }

            if (grpMeta?.id) {
              if (processedGroups.has(grpMeta.id)) continue;
              processedGroups.add(grpMeta.id);

              const groupFields = recipientFields.filter((gf) => {
                if (gf.fieldType !== 'checkbox' || !gf.options) return false;
                try { return JSON.parse(gf.options)?.group?.id === grpMeta!.id; } catch { return false; }
              });

              if (!groupFields.some((gf) => prevData[gf.variableName])) continue;

              if (pendingSection) { fields.push(pendingSection); pendingSection = null; }
              fields.push({
                fieldType: 'checkboxGroup',
                variableName: grpMeta.id,
                label: grpMeta.question,
                value: '',
                groupId: grpMeta.id,
                groupQuestion: grpMeta.question,
                groupMaxSelections: grpMeta.maxSelections,
                groupOptions: groupFields.map((gf) => ({
                  variableName: gf.variableName,
                  label: gf.label,
                  checked: !!prevData[gf.variableName],
                })),
              });
            } else {
              if (!prevData[f.variableName]) continue;
              if (pendingSection) { fields.push(pendingSection); pendingSection = null; }
              fields.push({ label: f.label, variableName: f.variableName, fieldType: f.fieldType, value: prevData[f.variableName] });
            }
          }

          // Find attachments uploaded in the previous session's pending dir
          const pendingDir = path.resolve(process.cwd(), '../data/pending-attachments', prevSession.token);
          const attachments: { slotLabel: string; slotId: string; filename: string; originalName: string }[] = [];
          if (fs.existsSync(pendingDir)) {
            for (const slot of attachmentSlots) {
              if (slot.recipientOrder !== null && slot.recipientOrder !== prevOrder) continue;
              const fileEntry = fs.readdirSync(pendingDir).find((f) => f.startsWith(`${slot.id}_`));
              if (!fileEntry) continue;
              const metaPath = path.join(pendingDir, `${slot.id}.meta`);
              let originalName = fileEntry;
              if (fs.existsSync(metaPath)) {
                try { originalName = JSON.parse(fs.readFileSync(metaPath, 'utf-8')).originalName; } catch {}
              }
              attachments.push({ slotLabel: slot.label, slotId: slot.id, filename: fileEntry, originalName });
            }
          }

          previousAnswers.push({
            recipientOrder: prevOrder,
            recipientLabel: prevRecipient?.label ?? `Responsável ${prevOrder}`,
            recipientColor: prevRecipient?.color ?? '#6B7280',
            prevSessionToken: prevSession.token,
            fields,
            attachments,
          });
        }
      }

      await this.prisma.publicLink.update({
        where: { id: link.id },
        data: { accessCount: { increment: 1 } },
      });

      return {
        ...link,
        sessionType: 'recipient' as const,
        sessionToken: session.token,
        recipientOrder: session.recipientOrder,
        recipientLabel: recipient?.label ?? `Responsável ${session.recipientOrder}`,
        recipientColor: recipient?.color ?? '#3B82F6',
        totalRecipients,
        previousAnswers,
      };
    }

    // Original single-recipient path
    const link = await this.prisma.publicLink.findUnique({
      where: { token },
      include: { template: true },
    });

    if (!link || link.expiresAt < new Date() || link.revokedAt) {
      throw new Error('Link inválido ou expirado');
    }

    // Guard: if this is a multi-recipient link accessed via PublicLink token,
    // auto-route to the first pending session so field visibility filtering works correctly.
    const pendingSession = await this.prisma.recipientSession.findFirst({
      where: { linkId: link.id, status: { not: 'completed' } },
      orderBy: { recipientOrder: 'asc' },
      include: { link: { include: { template: true } } },
    });

    if (pendingSession) {
      // Re-enter via the session path — ensures correct field visibility and email chaining
      const [recipient, totalRecipients] = await Promise.all([
        this.prisma.templateRecipient.findUnique({
          where: { templateId_order: { templateId: link.templateId, order: pendingSession.recipientOrder } },
        }),
        this.prisma.templateRecipient.count({ where: { templateId: link.templateId } }),
      ]);

      await this.prisma.publicLink.update({
        where: { id: link.id },
        data: { accessCount: { increment: 1 } },
      });

      return {
        ...link,
        sessionType: 'recipient' as const,
        sessionToken: pendingSession.token,
        recipientOrder: pendingSession.recipientOrder,
        recipientLabel: recipient?.label ?? `Responsável ${pendingSession.recipientOrder}`,
        recipientColor: recipient?.color ?? '#3B82F6',
        totalRecipients,
      };
    }

    const usedSubmission = await this.prisma.submission.findFirst({
      where: { linkId: link.id, status: { not: 'error' } },
      orderBy: { createdAt: 'desc' },
    });
    if (usedSubmission) {
      const err: any = new Error('Este link já foi utilizado.');
      err.submissionStatus = usedSubmission.status;
      throw err;
    }

    await this.prisma.publicLink.update({
      where: { id: link.id },
      data: { accessCount: { increment: 1 } },
    });

    return { ...link, sessionType: 'link' as const };
  }

  async revokeLink(token: string, user?: AuthUser) {
    const link = await this.prisma.publicLink.findUnique({ where: { token } });
    if (!link) throw new Error('Link não encontrado');

    if (user?.role === 'OPERATOR' && link.createdById !== user.sub) {
      throw new Error('Sem permissão para revogar este link');
    }

    return this.prisma.publicLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
  }

  async bulkRevokeLinks(tokens: string[], user?: AuthUser) {
    const where: any = { token: { in: tokens } };
    if (user?.role === 'OPERATOR') {
      where.createdById = user.sub;
    }
    return this.prisma.publicLink.updateMany({ where, data: { revokedAt: new Date() } });
  }

  async listSubmissions(user?: AuthUser & { departmentIds?: string[] }, filterDepartmentIds?: string[]) {
    let where: any = {};

    if (user) {
      let allowedDepts = user.role === 'SUPER_ADMIN' ? null : (user.departmentIds || []);
      let targetDepts = filterDepartmentIds && filterDepartmentIds.length > 0 ? filterDepartmentIds : allowedDepts;
      
      if (allowedDepts && filterDepartmentIds && filterDepartmentIds.length > 0) {
        targetDepts = filterDepartmentIds.filter(id => allowedDepts.includes(id));
      }

      if (targetDepts) {
        where.link = { template: { departmentId: { in: targetDepts } } };
      }

      // Filtro global para esconder departamentos deletados (Soft Delete)
      where.link = {
        ...(where.link || {}),
        template: {
          ...(where.link?.template || {}),
          OR: [
            { departmentId: null },
            { department: { deletedAt: null } }
          ]
        }
      };

      if (user.role === 'OPERATOR') {
        where.link = { ...where.link, createdById: user.sub };
      }
    }

    return this.prisma.submission.findMany({
      where,
      include: { link: { include: { template: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listSubmissionsPaginated(page: number = 1, limit: number = 20, user?: AuthUser & { departmentIds?: string[] }, filterDepartmentIds?: string[]) {
    const skip = (page - 1) * limit;
    let where: any = {};

    if (user) {
      let allowedDepts = user.role === 'SUPER_ADMIN' ? null : (user.departmentIds || []);
      let targetDepts = filterDepartmentIds && filterDepartmentIds.length > 0 ? filterDepartmentIds : allowedDepts;
      
      if (allowedDepts && filterDepartmentIds && filterDepartmentIds.length > 0) {
        targetDepts = filterDepartmentIds.filter(id => allowedDepts.includes(id));
      }

      if (targetDepts) {
        where.link = { template: { departmentId: { in: targetDepts } } };
      }

      where.link = {
        ...(where.link || {}),
        template: {
          ...(where.link?.template || {}),
          OR: [
            { departmentId: null },
            { department: { deletedAt: null } }
          ]
        }
      };

      if (user.role === 'OPERATOR') {
        where.link = { ...where.link, createdById: user.sub };
      }
    }

    const [total, items] = await Promise.all([
      this.prisma.submission.count({ where }),
      this.prisma.submission.findMany({
        where,
        skip,
        take: limit,
        include: { link: { include: { template: true, batch: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSubmissionDownloadUrl(submissionId: string, type: 'ZIP' | 'PDF' = 'ZIP') {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission || !submission.documentUUID) throw new Error("Submissão não encontrada ou sem UUID de documento.");
    
    return this.d4sign.getDownloadUrl(submission.documentUUID, type);
  }

  async uploadAttachment(token: string, attachmentId: string, file: Express.Multer.File): Promise<{ filename: string; originalName: string }> {
    const link = await this.resolveLinkFromToken(token);
    if (!link || link.expiresAt < new Date() || link.revokedAt) {
      throw new Error('Link inválido ou expirado');
    }

    const slot = await this.prisma.templateAttachment.findFirst({ where: { id: attachmentId, templateId: link.templateId, deletedAt: null } });
    if (!slot) throw new Error('Slot de anexo não encontrado');

    const pendingDir = path.resolve(process.cwd(), '../data/pending-attachments', token);
    if (!fs.existsSync(pendingDir)) fs.mkdirSync(pendingDir, { recursive: true });

    // Remove arquivo anterior deste slot se existir (arquivo + meta)
    const existing = fs.readdirSync(pendingDir).find((f) => f.startsWith(`${attachmentId}_`));
    if (existing) fs.unlinkSync(path.join(pendingDir, existing));
    const existingMeta = path.join(pendingDir, `${attachmentId}.meta`);
    if (fs.existsSync(existingMeta)) fs.unlinkSync(existingMeta);

    // Multer decodifica o campo originalname como Latin-1 por padrão.
    // Re-interpreta os bytes como UTF-8 para preservar acentos e caracteres especiais.
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const ext = path.extname(originalName) || '';
    const filename = `${attachmentId}_${Date.now()}${ext}`;
    fs.writeFileSync(path.join(pendingDir, filename), file.buffer);
    fs.writeFileSync(existingMeta, JSON.stringify({ originalName }));

    return { filename, originalName };
  }

  async deleteAttachment(token: string, attachmentId: string): Promise<void> {
    const pendingDir = path.resolve(process.cwd(), '../data/pending-attachments', token);
    if (!fs.existsSync(pendingDir)) return;
    const existing = fs.readdirSync(pendingDir).find((f) => f.startsWith(`${attachmentId}_`));
    if (existing) fs.unlinkSync(path.join(pendingDir, existing));
    const metaPath = path.join(pendingDir, `${attachmentId}.meta`);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  }

  /** Resolve a link record from either a PublicLink token or a RecipientSession token. */
  private async resolveLinkFromToken(token: string) {
    const session = await this.prisma.recipientSession.findUnique({ where: { token }, select: { linkId: true } });
    if (session) {
      return this.prisma.publicLink.findUnique({ where: { id: session.linkId } });
    }
    return this.prisma.publicLink.findUnique({ where: { token } });
  }

  /** Move pending attachment files from one or more token dirs into a permanent submission dir. */
  private async movePendingAttachments(tokens: string[], submissionId: string): Promise<void> {
    const destDir = path.resolve(process.cwd(), '../data/attachments', submissionId);
    fs.mkdirSync(destDir, { recursive: true });

    for (const tkn of tokens) {
      const pendingDir = path.resolve(process.cwd(), '../data/pending-attachments', tkn);
      if (!fs.existsSync(pendingDir)) continue;

      const files = fs.readdirSync(pendingDir).filter((f) => !f.endsWith('.meta'));
      for (const filename of files) {
        const attachmentId = filename.split('_')[0];
        const slot = await this.prisma.templateAttachment.findUnique({ where: { id: attachmentId } });
        if (!slot) continue;

        const metaPath = path.join(pendingDir, `${attachmentId}.meta`);
        let originalName = filename;
        if (fs.existsSync(metaPath)) {
          try { originalName = JSON.parse(fs.readFileSync(metaPath, 'utf-8')).originalName; } catch {}
          fs.unlinkSync(metaPath);
        }

        fs.renameSync(path.join(pendingDir, filename), path.join(destDir, filename));

        const ext = path.extname(filename).toLowerCase();
        const mimeType = ext === '.pdf' ? 'application/pdf'
          : ['.jpg', '.jpeg'].includes(ext) ? 'image/jpeg'
          : ext === '.png' ? 'image/png'
          : ext === '.webp' ? 'image/webp'
          : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/octet-stream';

        await this.prisma.submissionAttachment.create({
          data: { submissionId, templateAttachmentId: attachmentId, filename, originalName, mimeType },
        });
      }

      try { fs.rmdirSync(pendingDir); } catch {}
    }
  }

  async submitForm(token: string, formData: Record<string, string>) {
    // Multi-recipient path: session token detected
    const session = await this.prisma.recipientSession.findUnique({
      where: { token },
      include: { link: { include: { template: true } } },
    });
    if (session) {
      return this.submitRecipientSession(session, formData);
    }

    // Safety guard: PublicLink token used but link has pending sessions → route correctly
    const linkCheck = await this.prisma.publicLink.findUnique({ where: { token } });
    if (linkCheck) {
      const pendingSession = await this.prisma.recipientSession.findFirst({
        where: { linkId: linkCheck.id, status: { not: 'completed' } },
        orderBy: { recipientOrder: 'asc' },
        include: { link: { include: { template: true } } },
      });
      if (pendingSession) {
        return this.submitRecipientSession(pendingSession, formData);
      }
    }

    // Original single-recipient path
    const link = await this.getLinkByToken(token);

    const filteredFormData = Object.fromEntries(
      Object.entries(formData).filter(([, v]) => v !== '' && v !== null && v !== undefined),
    );

    const submission = await this.prisma.submission.create({
      data: { linkId: link.id, formData: JSON.stringify(filteredFormData), status: 'pending' },
    });

    await this.movePendingAttachments([token], submission.id);

    this.processD4SignSubmission(submission.id, link.templateId, filteredFormData).catch(
      (err) => this.logger.error(`Erro no processamento D4Sign: ${err.message}`),
    );

    return submission;
  }

  private async submitRecipientSession(
    session: { id: string; linkId: string; recipientOrder: number; email: string | null; token: string; status: string; link: any },
    formData: Record<string, string>,
  ): Promise<{ ok: boolean; moreRecipients: boolean }> {
    const link = session.link;

    if (link.expiresAt < new Date() || link.revokedAt) throw new Error('Link inválido ou expirado');
    if (session.status === 'completed') throw new Error('Esta etapa já foi preenchida.');

    // Save this session's formData and mark as completed.
    // Only persist non-empty values so that the final multi-session merge is not
    // corrupted by empty-string placeholders initialised by the frontend for all fields.
    const sessionFormData = Object.fromEntries(
      Object.entries(formData).filter(([, v]) => v !== '' && v !== null && v !== undefined),
    );
    await this.prisma.recipientSession.update({
      where: { id: session.id },
      data: { formData: JSON.stringify(sessionFormData), status: 'completed', completedAt: new Date() },
    });

    // Reload all sessions for this link
    const allSessions = await this.prisma.recipientSession.findMany({
      where: { linkId: link.id },
      orderBy: { recipientOrder: 'asc' },
    });

    const nextSession = allSessions.find((s) => s.id !== session.id && s.status !== 'completed');

    if (nextSession) {
      // Still more recipients — send email to next one
      if (nextSession.email) {
        const template = await this.prisma.documentTemplate.findUnique({ where: { id: link.templateId } });
        try {
          const sent = await this.email.sendLinkEmail({
            to: { name: nextSession.name || nextSession.email, address: nextSession.email },
            templateName: template?.name || 'Documento',
            linkUrl: `${this.frontendUrl}/public/${nextSession.token}`,
            expiresAt: link.expiresAt,
          });
          if (sent) {
            await this.prisma.recipientSession.update({
              where: { id: nextSession.id },
              data: { emailSentAt: new Date() },
            });
          }
        } catch (err: any) {
          this.logger.error(`Erro ao enviar e-mail para próximo responsável: ${err.message}`);
        }
      }
      return { ok: true, moreRecipients: true };
    }

    // All sessions done — merge formData (in order) and create the final Submission.
    // allSessions already contains the current session's saved data (saved above),
    // so no need to re-apply formData here (which would overwrite with empty placeholders).
    const mergedFormData: Record<string, string> = {};
    for (const s of allSessions) {
      if (s.formData) {
        try { Object.assign(mergedFormData, JSON.parse(s.formData)); } catch {}
      }
    }

    const submission = await this.prisma.submission.create({
      data: { linkId: link.id, formData: JSON.stringify(mergedFormData), status: 'pending' },
    });

    // Move pending attachments from ALL session token dirs
    await this.movePendingAttachments(allSessions.map((s) => s.token), submission.id);

    this.processD4SignSubmission(submission.id, link.templateId, mergedFormData).catch(
      (err) => this.logger.error(`Erro no processamento D4Sign (multi-responsável): ${err.message}`),
    );

    return { ok: true, moreRecipients: false };
  }

  private async processD4SignSubmission(
    submissionId: string,
    templateId: string,
    formData: Record<string, string>,
  ) {
    try {
      const template = await this.prisma.documentTemplate.findUnique({
        where: { id: templateId },
        include: {
          formFields: { orderBy: { order: 'asc' } },
          department: true,
        },
      });

      // Cada documento vai para o cofre do departamento do modelo.
      const safeUUID = template?.department?.safeUuid;
      if (!safeUUID) {
        throw new Error(
          `Nenhum cofre D4Sign configurado: o departamento do modelo "${template?.name}" não possui cofre vinculado.`,
        );
      }

      const docName = `${template?.name} - ${submissionId.split('-')[0]}`;

      this.logger.log(`[${submissionId}] Gerando documento (modo: ${template?.mode ?? 'template'})...`);
      const expandedFormData = await this.expandFormData(formData, templateId);

      let generatedPath: string;
      if (template?.mode === 'overlay') {
        if (!template.basePdfPath) {
          throw new Error(`Modelo overlay sem PDF base anexado.`);
        }
        generatedPath = await this.docgen.generateOverlayDocument(
          template.basePdfPath,
          template.formFields.map((f) => ({ variableName: f.variableName, options: f.options })),
          expandedFormData,
        );
      } else {
        if (!template?.localTemplatePath) {
          throw new Error(`Modelo sem DOCX anexado.`);
        }
        generatedPath = await this.docgen.generateDocument(template.localTemplatePath, expandedFormData, false);
      }

      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { generatedPath, status: 'docx_generated' },
      });

      const ext = generatedPath.endsWith('.pdf') ? 'PDF' : 'DOCX';
      this.logger.log(`[${submissionId}] Fazendo upload do ${ext} para D4Sign...`);

      // Read page count before upload so fallback is accurate if D4Sign dimensions API fails
      let localPageCount = 1;
      if (generatedPath.endsWith('.pdf')) {
        try {
          localPageCount = await this.docgen.getPdfPageCount(generatedPath);
        } catch (err: any) {
          this.logger.warn(`[${submissionId}] Não foi possível ler páginas do PDF local: ${err.message}`);
        }
      }

      const documentUUID = await this.d4sign.uploadDocument(safeUUID, generatedPath, docName);

      this.cleanupGeneratedFiles(submissionId, generatedPath);

      this.logger.log(`[${submissionId}] Aguardando processamento do documento pela D4Sign (dimensões)...`);
      let dimensions: { page: number; width: number; height: number }[] = [];
      try {
        dimensions = await this.d4sign.getDocumentDimensions(documentUUID);
      } catch (err) {
        this.logger.warn(`[${submissionId}] Não foi possível obter dimensões da D4Sign: ${err.message}. Usando fallback (${localPageCount} página(s) A4).`);
        dimensions = Array.from({ length: localPageCount }, (_, i) => ({ page: i + 1, width: 794, height: 1123 }));
      }

      const numPages = dimensions.length;
      this.logger.log(`[${submissionId}] Documento pronto: ${numPages} página(s).`);

      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { documentUUID, status: 'document_created' },
      });

      // Carrega signatários D4Sign do link (lista plana)
      const submissionRecord = await this.prisma.submission.findUnique({
        where: { id: submissionId },
        select: {
          link: {
            select: { additionalSigners: true, internalSigners: true },
          },
        },
      });

      const parseEmails = (raw: string | null | undefined): string[] =>
        raw ? (JSON.parse(raw) as string[]).filter(Boolean) : [];

      const d4signEmails: string[] = [
        ...parseEmails(submissionRecord?.link?.additionalSigners),
        ...parseEmails(submissionRecord?.link?.internalSigners),
      ];

      const seen = new Set<string>();
      const signers = d4signEmails
        .filter((email) => { if (seen.has(email)) return false; seen.add(email); return true; })
        .map((email) => ({ email, name: email }));

      if (signers.length === 0) {
        this.logger.warn(`[${submissionId}] Nenhum signatário configurado.`);
      } else {
        for (const signer of signers) {
          this.logger.log(`[${submissionId}] Adicionando signatário ${signer.email}...`);
          await this.d4sign.addSigner(documentUUID, signer.email, signer.name);
        }

        await this.prisma.submission.update({
          where: { id: submissionId },
          data: { status: 'signer_created' },
        });

        // Pins: todos os signatários distribuídos uniformemente da esquerda para a direita
        const allPins: any[] = [];

        for (const dim of dimensions) {
          const page = dim.page;
          const isLast = page === numPages;
          const PAGE_W = dim.width;
          const PAGE_H = dim.height;

          const scaleX = PAGE_W / 794;
          const scaleY = PAGE_H / 1123;

          const posY = 1067 * scaleY;
          const posXLeft = 69 * scaleX;
          const posXRight = 580 * scaleX;
          const pinType = isLast ? 0 : 1;

          signers.forEach(({ email }, idx) => {
            const posX = signers.length === 1
              ? posXRight
              : posXLeft + (posXRight - posXLeft) * idx / (signers.length - 1);
            allPins.push({
              email,
              page,
              page_width: PAGE_W,
              page_height: PAGE_H,
              position_x: Math.round(posX),
              position_y: Math.round(posY),
              type: pinType,
            });
          });
        }

        if (allPins.length > 0) {
          this.logger.log(`[${submissionId}] Configurando ${allPins.length} pins...`);
          await this.d4sign.addPins(documentUUID, allPins);
        }

        this.logger.log(`[${submissionId}] Enviando para assinatura...`);
        await this.d4sign.sendToSigners(
          documentUUID,
          process.env.D4SIGN_SIGN_MESSAGE || 'Olá! Segue documento para assinatura.',
        );

        await this.prisma.submission.update({
          where: { id: submissionId },
          data: { status: 'sent_to_sign' },
        });
      }

      this.logger.log(`[${submissionId}] Fluxo concluído com sucesso.`);
    } catch (error) {
      this.logger.error(`[${submissionId}] Falha crítica: ${error.message}`);
      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { status: 'error', lastError: error.message },
      });
    }
  }

  async getSubmissionDetails(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        formData: true,
        createdAt: true,
        link: {
          select: {
            templateId: true,
            recipientSessions: {
              select: { recipientOrder: true, email: true, name: true, status: true, completedAt: true, formData: true },
              orderBy: { recipientOrder: 'asc' },
            },
          },
        },
      },
    });
    if (!submission) throw new Error('Submissão não encontrada');

    const formData: Record<string, string> = JSON.parse(submission.formData || '{}');
    const templateId = submission.link?.templateId;

    const attachments = await this.getSubmissionAttachments(submissionId);

    if (!templateId) {
      return { textFields: [], scoreFields: [], hasScoring: false, totalPoints: 0, maxPoints: 0, percentage: 0, attachments, submittedAt: submission.createdAt, recipientSessions: [] };
    }

    const [allFields, templateRecipients] = await Promise.all([
      this.prisma.templateField.findMany({ where: { templateId }, orderBy: { order: 'asc' } }),
      this.prisma.templateRecipient.findMany({
        where: { templateId },
        orderBy: { order: 'asc' },
        select: { order: true, label: true, color: true },
      }),
    ]);

    const { scoreFields, hasScoring, totalPoints, maxPoints, scoredVariables } = this.computeScoring(allFields, formData);

    const textFields = allFields
      .filter((f) => f.fieldType !== 'select' && !scoredVariables.has(f.variableName))
      .map((f) => ({ label: f.label, variableName: f.variableName, fieldType: f.fieldType, value: formData[f.variableName] || '' }));

    // Per-recipient session breakdown
    const rawSessions = submission.link?.recipientSessions ?? [];
    const recipientSessions = rawSessions.map((s) => {
      const sessionFormData: Record<string, string> = {};
      if (s.formData) {
        try { Object.assign(sessionFormData, JSON.parse(s.formData)); } catch {}
      }

      // Fields assigned to this recipient (or null = unassigned, include only if this session filled them)
      const recipientFields = allFields.filter(
        (f) => (f.recipientOrder === s.recipientOrder || f.recipientOrder === null) && f.fieldType !== 'section',
      );

      const processedGroups = new Set<string>();
      const filledFields: object[] = [];

      for (const f of recipientFields) {
        let grpMeta: { id: string; question: string; maxSelections: number } | null = null;
        if (f.fieldType === 'checkbox' && f.options) {
          try { grpMeta = JSON.parse(f.options)?.group ?? null; } catch {}
        }

        if (grpMeta?.id) {
          if (processedGroups.has(grpMeta.id)) continue;
          processedGroups.add(grpMeta.id);

          const groupFields = recipientFields.filter((gf) => {
            if (gf.fieldType !== 'checkbox' || !gf.options) return false;
            try { return JSON.parse(gf.options)?.group?.id === grpMeta!.id; } catch { return false; }
          });

          if (!groupFields.some((gf) => sessionFormData[gf.variableName])) continue;

          filledFields.push({
            fieldType: 'checkboxGroup',
            variableName: grpMeta.id,
            label: grpMeta.question,
            value: '',
            groupId: grpMeta.id,
            groupQuestion: grpMeta.question,
            groupMaxSelections: grpMeta.maxSelections,
            groupOptions: groupFields.map((gf) => ({
              variableName: gf.variableName,
              label: gf.label,
              checked: !!sessionFormData[gf.variableName],
            })),
          });
        } else {
          if (!sessionFormData[f.variableName]) continue;
          filledFields.push({ label: f.label, variableName: f.variableName, fieldType: f.fieldType, value: sessionFormData[f.variableName] || '' });
        }
      }

      return {
        order: s.recipientOrder,
        email: s.email,
        name: s.name,
        status: s.status,
        completedAt: s.completedAt,
        fields: filledFields,
      };
    });

    return {
      textFields,
      scoreFields,
      hasScoring,
      totalPoints,
      maxPoints,
      percentage: maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0,
      attachments,
      submittedAt: submission.createdAt,
      recipientSessions,
      recipients: templateRecipients,
    };
  }

  async getSubmissionScore(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { formData: true, link: { select: { templateId: true } } },
    });
    if (!submission) throw new Error('Submissão não encontrada');

    const formData: Record<string, string> = JSON.parse(submission.formData || '{}');
    const templateId = submission.link?.templateId;

    if (!templateId) return { hasScoring: false, fields: [], totalPoints: 0, maxPoints: 0, percentage: 0 };

    const allFields = await this.prisma.templateField.findMany({
      where: { templateId },
      orderBy: { order: 'asc' },
    });

    const { scoreFields, hasScoring, totalPoints, maxPoints } = this.computeScoring(allFields, formData);

    return {
      hasScoring,
      fields: scoreFields,
      totalPoints,
      maxPoints,
      percentage: maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0,
    };
  }

  private computeScoring(
    fields: Array<{ fieldType: string; variableName: string; label: string; options: string | null }>,
    formData: Record<string, string>,
  ): {
    scoreFields: Array<{ variableName: string; label: string; answer: string; points: number | null; maxPoints: number | null; choices: string[] }>;
    hasScoring: boolean;
    totalPoints: number;
    maxPoints: number;
    scoredVariables: Set<string>;
  } {
    let totalPoints = 0;
    let maxPoints = 0;
    let hasScoring = false;
    const scoreFields: Array<{ variableName: string; label: string; answer: string; points: number | null; maxPoints: number | null; choices: string[] }> = [];
    const scoredVariables = new Set<string>();

    // ── SELECT fields (DOCX mode: choices + weights) ──────────────────
    for (const field of fields.filter((f) => f.fieldType === 'select')) {
      let opts: { choices?: string[]; weights?: number[] } = {};
      try { if (field.options) opts = JSON.parse(field.options); } catch { continue; }

      const choices: string[] = opts.choices || [];
      const weights: number[] | null = opts.weights?.length === choices.length ? opts.weights : null;
      if (!weights) continue;

      hasScoring = true;
      scoredVariables.add(field.variableName);

      const answer = formData[field.variableName] || '';
      const idx = choices.indexOf(answer);
      const pts = idx >= 0 ? weights[idx] : 0;
      const maxPts = Math.max(...weights);
      totalPoints += pts;
      maxPoints += maxPts;

      scoreFields.push({ variableName: field.variableName, label: field.label, answer, points: pts, maxPoints: maxPts, choices });
    }

    // ── CHECKBOX fields (overlay mode: group.score) ────────────────────
    const checkboxFields = fields.filter((f) => f.fieldType === 'checkbox');
    const seenGroupIds = new Set<string>();

    for (const field of checkboxFields) {
      let opts: { overlay?: { checkValue?: string }; group?: any; grpMeta?: any } = {};
      try { if (field.options) opts = JSON.parse(field.options); } catch { continue; }

      const groupData = opts.group || opts.grpMeta;
      if (!groupData || !(groupData.score > 0)) continue;

      const groupId: string | null = groupData.id || null;

      if (groupId) {
        if (seenGroupIds.has(groupId)) continue;
        seenGroupIds.add(groupId);

        const groupFields = checkboxFields.filter((gf) => {
          try {
            const o = gf.options ? JSON.parse(gf.options) : {};
            return (o.group || o.grpMeta)?.id === groupId;
          } catch { return false; }
        });

        hasScoring = true;
        groupFields.forEach((gf) => scoredVariables.add(gf.variableName));

        let groupPoints = 0;
        const checkedLabels: string[] = [];
        const allScores: number[] = [];

        for (const gf of groupFields) {
          let gopts: { overlay?: { checkValue?: string }; group?: any; grpMeta?: any } = {};
          try { gopts = gf.options ? JSON.parse(gf.options) : {}; } catch { continue; }
          const gd = gopts.group || gopts.grpMeta;
          const score: number = gd?.score ?? 0;
          allScores.push(score);

          const checkValue = gopts.overlay?.checkValue;
          const isChecked = checkValue !== undefined
            ? formData[gf.variableName] === checkValue
            : formData[gf.variableName] === '✓';

          if (isChecked) {
            groupPoints += score;
            checkedLabels.push(gf.label || gf.variableName);
          }
        }

        const maxSelections: number = groupData.maxSelections ?? 1;
        const groupMaxPoints = [...allScores].sort((a, b) => b - a).slice(0, maxSelections).reduce((s, n) => s + n, 0);
        totalPoints += groupPoints;
        maxPoints += groupMaxPoints;

        scoreFields.push({
          variableName: groupId,
          label: groupData.question || groupId,
          answer: checkedLabels.join(', '),
          points: groupPoints,
          maxPoints: groupMaxPoints,
          choices: [],
        });
      } else {
        // Standalone scored checkbox (sem grupo)
        hasScoring = true;
        scoredVariables.add(field.variableName);

        const score: number = groupData.score;
        const checkValue = opts.overlay?.checkValue;
        const isChecked = checkValue !== undefined
          ? formData[field.variableName] === checkValue
          : formData[field.variableName] === '✓';

        const pts = isChecked ? score : 0;
        totalPoints += pts;
        maxPoints += score;

        scoreFields.push({
          variableName: field.variableName,
          label: field.label,
          answer: isChecked ? field.label : '',
          points: pts,
          maxPoints: score,
          choices: [],
        });
      }
    }

    return { scoreFields, hasScoring, totalPoints, maxPoints, scoredVariables };
  }

  async getSubmissionAttachments(submissionId: string) {
    return this.prisma.submissionAttachment.findMany({
      where: { submissionId },
      include: { templateAttachment: { select: { label: true, required: true, order: true, recipientOrder: true } } },
      orderBy: { templateAttachment: { order: 'asc' } },
    });
  }

  async retrySubmission(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { status: true, formData: true, link: { select: { templateId: true } } },
    });

    if (!submission) throw new Error('Submissão não encontrada');

    // 'pending' means D4Sign processing is already running — block to avoid duplicates
    const retryable = ['docx_generated', 'document_created', 'signer_created', 'error'];
    if (!retryable.includes(submission.status)) {
      if (submission.status === 'pending') {
        throw new Error('Processamento já em andamento. Aguarde a conclusão antes de reprocessar.');
      }
      throw new Error(`Status "${submission.status}" não pode ser reprocessado`);
    }

    const templateId = submission.link?.templateId;
    if (!templateId) throw new Error('Template não encontrado');

    const formData: Record<string, string> = JSON.parse(submission.formData || '{}');

    await this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'pending', documentUUID: null, generatedPath: null, lastError: null },
    });

    this.processD4SignSubmission(submissionId, templateId, formData).catch(
      (err) => this.logger.error(`[${submissionId}] Erro no reprocessamento: ${err.message}`),
    );

    return { ok: true };
  }

  async syncSubmission(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission || !submission.documentUUID) throw new Error("Submissão não encontrada ou sem UUID.");

    const d4signData = await this.d4sign.getDocumentInfo(submission.documentUUID);
    const docInfo = Array.isArray(d4signData) ? d4signData[0] : d4signData;
    
    if (!docInfo) throw new Error("Documento não encontrado na D4Sign.");

    // Status ID na D4Sign (geralmente idStatus ou statusId)
    // 4 = Finalizado/Assinado, 6 = Cancelado/Erro
    const statusId = String(docInfo.statusId || docInfo.statusIdDocumento || docInfo.idStatus || '');
    
    let newStatus = submission.status;
    if (statusId === '4') newStatus = 'signed';
    else if (statusId === '6') newStatus = 'error';

    if (newStatus !== submission.status) {
      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { status: newStatus }
      });
      this.logger.log(`[${submissionId}] Status sincronizado manualmente para ${newStatus} (D4Sign statusId: ${statusId})`);
    } else {
      this.logger.log(`[${submissionId}] Status sincronizado manualmente manteve-se ${newStatus} (D4Sign statusId: ${statusId})`);
    }

    return { status: newStatus, d4signStatusId: statusId };
  }

  async syncPendingSubmissions() {
    const pendingSubmissions = await this.prisma.submission.findMany({
      where: { 
        status: 'sent_to_sign',
        link: {
          revokedAt: null,
          template: { deletedAt: null }
        }
      },
      select: { id: true, documentUUID: true }
    });

    let updatedCount = 0;
    
    for (const sub of pendingSubmissions) {
      if (!sub.documentUUID) continue;
      try {
        const result = await this.syncSubmission(sub.id);
        if (result.status !== 'sent_to_sign') {
          updatedCount++;
        }
      } catch (err: any) {
        this.logger.error(`[${sub.id}] Erro ao sincronizar em lote: ${err.message}`);
      }
    }

    return { updatedCount, totalChecked: pendingSubmissions.length };
  }

  async generatePreview(
    token: string,
    formData: Record<string, string>,
  ): Promise<{ filename: string; isPdf: boolean }> {
    // Support both PublicLink tokens and RecipientSession tokens
    const session = await this.prisma.recipientSession.findUnique({ where: { token } });
    const link = session
      ? await this.prisma.publicLink.findUnique({
          where: { id: session.linkId },
          include: { template: { include: { formFields: { orderBy: { order: 'asc' } } } } },
        })
      : await this.prisma.publicLink.findUnique({
          where: { token },
          include: { template: { include: { formFields: { orderBy: { order: 'asc' } } } } },
        });

    if (!link) throw new Error('Link não encontrado');

    // For recipient sessions, merge data from all previously completed sessions so the
    // preview shows the full document (R1 + R2 + current recipient's answers).
    let effectiveFormData = formData;
    if (session) {
      const prevSessions = await this.prisma.recipientSession.findMany({
        where: { linkId: session.linkId, recipientOrder: { lt: session.recipientOrder }, status: 'completed' },
        orderBy: { recipientOrder: 'asc' },
      });
      const merged: Record<string, string> = {};
      for (const s of prevSessions) {
        if (s.formData) {
          try { Object.assign(merged, JSON.parse(s.formData)); } catch {}
        }
      }
      // Current session's non-empty values take precedence
      for (const [k, v] of Object.entries(formData)) {
        if (v !== '' && v !== null && v !== undefined) merged[k] = v;
      }
      effectiveFormData = merged;
    }

    const expandedFormData = await this.expandFormData(effectiveFormData, link.templateId);

    if (link.template?.mode === 'overlay') {
      if (!link.template.basePdfPath) throw new Error('Modelo overlay sem PDF base anexado');
      const previewPath = await this.docgen.generateOverlayDocument(
        link.template.basePdfPath,
        (link.template.formFields ?? []).map((f) => ({ variableName: f.variableName, options: f.options })),
        expandedFormData,
        this.docgen.previewDir,
      );
      return { filename: path.basename(previewPath), isPdf: true };
    }

    if (!link.template?.localTemplatePath) throw new Error('Modelo sem arquivo DOCX anexado');

    const { previewPath, isPdf } = await this.docgen.generatePreview(
      link.template.localTemplatePath,
      expandedFormData,
    );

    return { filename: path.basename(previewPath), isPdf };
  }

  /**
   * Expande campos do tipo "select" no formData:
   * - Para cada campo select com variável Q1 e opções ["SIM","AP","NÃO"],
   *   gera Q1_SIM / Q1_AP / Q1_NAO com "X" ou "" conforme a seleção.
   * - Se o campo tiver pesos configurados, calcula TOTAL_PONTOS e PONTUACAO_PERCENTUAL.
   */
  private async expandFormData(
    formData: Record<string, string>,
    templateId: string,
  ): Promise<Record<string, string>> {
    const fields = await this.prisma.templateField.findMany({
      where: { templateId, fieldType: 'select' },
    });

    const expanded = { ...formData };
    let totalScore = 0;
    let maxScore = 0;
    let hasWeights = false;

    for (const field of fields) {
      if (!field.options) continue;
      let opts: { choices?: string[]; weights?: number[] };
      try { opts = JSON.parse(field.options); } catch { continue; }

      const choices: string[] = opts.choices || [];
      const weights: number[] | null = opts.weights?.length === choices.length ? opts.weights : null;
      const selected = formData[field.variableName] || '';

      // Expande para variáveis individuais: Q1_SIM, Q1_AP, Q1_NAO
      for (const choice of choices) {
        const suffix = choice
          .toUpperCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos: NÃO → NAO
          .replace(/\s+/g, '_')
          .replace(/[^A-Z0-9_]/g, '');
        expanded[`${field.variableName}_${suffix}`] = selected === choice ? 'X' : '';
      }

      // Cálculo de pontuação
      if (weights) {
        hasWeights = true;
        const idx = choices.indexOf(selected);
        if (idx >= 0) totalScore += weights[idx];
        maxScore += Math.max(...weights);
      }
    }

    if (hasWeights) {
      expanded['TOTAL_PONTOS'] = String(totalScore);
      expanded['PONTUACAO_PERCENTUAL'] = maxScore > 0
        ? `${Math.round((totalScore / maxScore) * 100)}%`
        : '0%';
    }

    return expanded;
  }

  private cleanupGeneratedFiles(submissionId: string, uploadedPath: string): void {
    const toDelete = [uploadedPath];

    if (uploadedPath.endsWith('.pdf')) {
      toDelete.push(uploadedPath.replace(/\.pdf$/, '.docx'));
    }

    for (const filePath of toDelete) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.log(`[${submissionId}] Arquivo local removido: ${filePath}`);
        }
      } catch (err: any) {
        this.logger.warn(`[${submissionId}] Não foi possível remover ${filePath}: ${err.message}`);
      }
    }
  }
}
