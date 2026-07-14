import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
      include: { departments: true },
    });
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    const departmentIds = user.departments.map((d) => d.departmentId);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      departmentIds,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        canViewBalance: user.canViewBalance,
        departmentIds,
      },
    };
  }

  async forgotPassword(email: string): Promise<{ ok: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email, deletedAt: null } });
    // Sempre retorna ok — não revelamos se o e-mail existe
    if (!user) return { ok: true };

    // Remove tokens de reset anteriores ainda não usados
    await this.prisma.authToken.deleteMany({ where: { userId: user.id, type: 'RESET', usedAt: null } });

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 horas

    await this.prisma.authToken.create({
      data: { token, type: 'RESET', email: user.email, userId: user.id, expiresAt },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3030';
    await this.emailService.sendPasswordResetEmail({
      to: { name: user.name || user.email, address: user.email },
      resetUrl: `${frontendUrl}/reset-password?token=${token}`,
      expiresAt,
    });

    return { ok: true };
  }

  async validateToken(token: string): Promise<{ valid: boolean; type?: string; email?: string; name?: string }> {
    const authToken = await this.prisma.authToken.findUnique({ where: { token } });
    if (!authToken || authToken.usedAt || authToken.expiresAt < new Date()) {
      return { valid: false };
    }
    return {
      valid: true,
      type: authToken.type,
      email: authToken.email,
      name: authToken.inviteName ?? undefined,
    };
  }

  async resetPassword(token: string, password: string): Promise<{ ok: boolean }> {
    const authToken = await this.prisma.authToken.findUnique({ where: { token } });
    if (!authToken || authToken.type !== 'RESET' || authToken.usedAt || authToken.expiresAt < new Date()) {
      throw new BadRequestException('Link de redefinição inválido ou expirado.');
    }

    const hash = await bcrypt.hash(password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: authToken.userId! }, data: { password: hash } }),
      this.prisma.authToken.update({ where: { token }, data: { usedAt: new Date() } }),
    ]);

    return { ok: true };
  }

  async acceptInvite(token: string, name: string, password: string): Promise<{ ok: boolean }> {
    const authToken = await this.prisma.authToken.findUnique({ where: { token } });
    if (!authToken || authToken.type !== 'INVITE' || authToken.usedAt || authToken.expiresAt < new Date()) {
      throw new BadRequestException('Convite inválido ou expirado.');
    }

    const exists = await this.prisma.user.findUnique({ where: { email: authToken.email } });
    if (exists) throw new ConflictException('Este e-mail já possui uma conta.');

    const hash = await bcrypt.hash(password, 12);
    const deptIds: string[] = authToken.inviteDepts ? JSON.parse(authToken.inviteDepts) : [];

    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          email: authToken.email,
          name: name?.trim() || authToken.inviteName || authToken.email,
          password: hash,
          role: authToken.inviteRole || 'ADMIN',
          departments: { create: deptIds.map((id) => ({ departmentId: id })) },
        },
      });
      await tx.authToken.update({ where: { token }, data: { usedAt: new Date() } });
    });

    return { ok: true };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      include: { departments: true },
    });
    if (!user) throw new UnauthorizedException('Sessão inválida');
    
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      canViewBalance: user.canViewBalance,
      departmentIds: user.departments.map((d) => d.departmentId),
    };
  }
}
