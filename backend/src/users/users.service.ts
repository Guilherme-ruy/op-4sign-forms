import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        canViewBalance: true,
        createdAt: true,
        deletedAt: true,
        _count: { select: { createdLinks: true } },
        departments: { 
          where: { department: { deletedAt: null } },
          include: { department: true } 
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        canViewBalance: true,
        createdAt: true,
        departments: {
          where: { department: { deletedAt: null } },
          include: { department: true }
        },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async create(data: { email: string; name?: string; password: string; role?: string; departmentIds?: string[] }) {
    const exists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new ConflictException('E-mail já cadastrado');

    // Prevent creating SUPER_ADMIN via API
    if (data.role === 'SUPER_ADMIN') {
      throw new ConflictException('Não é permitido criar novos Super Administradores via sistema.');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: passwordHash,
        role: data.role || 'ADMIN',
        departments: {
          create: (data.departmentIds || []).map((id) => ({ departmentId: id })),
        },
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  }

  async update(id: string, data: { email?: string; name?: string; password?: string; role?: string; departmentIds?: string[]; canViewBalance?: boolean }) {
    const user = await this.findOne(id);

    // Prevent editing SUPER_ADMIN via API
    if (user.role === 'SUPER_ADMIN') {
      throw new ConflictException('O Super Administrador mestre não pode ser editado via sistema.');
    }

    // Prevent promoting someone to SUPER_ADMIN
    if (data.role === 'SUPER_ADMIN') {
      throw new ConflictException('Não é permitido promover usuários para Super Administrador.');
    }

    const updateData: Record<string, any> = {};
    if (data.email) updateData.email = data.email;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.role) updateData.role = data.role;
    if (data.canViewBalance !== undefined) updateData.canViewBalance = data.canViewBalance;
    if (data.password) updateData.password = await bcrypt.hash(data.password, 12);

    if (data.departmentIds) {
      updateData.departments = {
        deleteMany: {},
        create: data.departmentIds.map((deptId) => ({ departmentId: deptId })),
      };
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    
    // Prevent deleting SUPER_ADMIN
    if (user.role === 'SUPER_ADMIN') {
      throw new ConflictException('O Super Administrador mestre não pode ser excluído.');
    }

    return this.prisma.user.update({ 
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async reactivate(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: null }
    });
  }

  async listPendingInvites() {
    return this.prisma.authToken.findMany({
      where: { type: 'INVITE', usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, inviteName: true, inviteRole: true, inviteDepts: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resendInvite(inviteId: string): Promise<{ ok: boolean }> {
    const invite = await this.prisma.authToken.findUnique({ where: { id: inviteId } });
    if (!invite || invite.type !== 'INVITE' || invite.usedAt) {
      throw new Error('Convite não encontrado ou já utilizado.');
    }
    const deptIds: string[] = invite.inviteDepts ? JSON.parse(invite.inviteDepts) : [];
    return this.invite({
      email: invite.email,
      name: invite.inviteName ?? undefined,
      role: invite.inviteRole ?? undefined,
      departmentIds: deptIds,
    });
  }

  async cancelInvite(inviteId: string): Promise<{ ok: boolean }> {
    await this.prisma.authToken.deleteMany({ where: { id: inviteId, type: 'INVITE' } });
    return { ok: true };
  }

  async invite(data: { email: string; name?: string; role?: string; departmentIds?: string[] }): Promise<{ ok: boolean }> {
    const exists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new ConflictException('Este e-mail já possui uma conta.');

    // Remove convites anteriores não utilizados para o mesmo e-mail
    await this.prisma.authToken.deleteMany({ where: { email: data.email, type: 'INVITE', usedAt: null } });

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 horas

    await this.prisma.authToken.create({
      data: {
        token,
        type: 'INVITE',
        email: data.email,
        inviteName: data.name ?? null,
        inviteRole: data.role || 'ADMIN',
        inviteDepts: data.departmentIds?.length ? JSON.stringify(data.departmentIds) : null,
        expiresAt,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3030';
    await this.emailService.sendInviteEmail({
      to: { name: data.name || data.email, address: data.email },
      inviteUrl: `${frontendUrl}/accept-invite?token=${token}`,
      expiresAt,
    });

    return { ok: true };
  }

  async getTemplateAccess(userId: string) {
    return this.prisma.userTemplateAccess.findMany({
      where: { userId },
      select: { templateId: true, template: { select: { id: true, name: true, documentType: true } } },
    });
  }

  async setTemplateAccess(userId: string, templateIds: string[]) {
    await this.findOne(userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.userTemplateAccess.deleteMany({ where: { userId } });
      if (templateIds.length > 0) {
        await tx.userTemplateAccess.createMany({
          data: templateIds.map((templateId) => ({ userId, templateId })),
        });
      }
      return tx.userTemplateAccess.findMany({
        where: { userId },
        select: { templateId: true, template: { select: { id: true, name: true } } },
      });
    });
  }
}
