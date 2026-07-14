import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { encryptSecret, decryptSecret } from '../common/crypto.util';

export interface EffectiveEmailConfig {
  fromName: string;
  fromEmail: string;
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string };
}

export interface UpdateEmailSettingsDto {
  fromName?: string;
  fromEmail?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPassword?: string; // só enviado quando o usuário digita uma nova senha
}

const SINGLETON_ID = 'singleton';

@Injectable()
export class EmailSettingsService {
  private readonly logger = new Logger(EmailSettingsService.name);

  constructor(private prisma: PrismaService) {}

  /** Defaults herdados do .env (retrocompatibilidade com a config antiga). */
  private get envDefaults() {
    return {
      fromName: process.env.EMAIL_FROM_NAME || 'Portal de Documentos',
      fromEmail: process.env.EMAIL_FROM_EMAIL || 'noreply@suaempresa.com.br',
    };
  }

  /** Config efetiva para envio — segredos decifrados, com fallback para o .env. */
  async getEffective(): Promise<EffectiveEmailConfig> {
    const row = await this.prisma.emailSettings.findUnique({ where: { id: SINGLETON_ID } });
    const env = this.envDefaults;

    if (!row) {
      return {
        fromName: env.fromName,
        fromEmail: env.fromEmail,
        smtp: { host: '', port: 587, secure: true, user: '', pass: '' },
      };
    }

    return {
      fromName: row.fromName || env.fromName,
      fromEmail: row.fromEmail || env.fromEmail,
      smtp: {
        host: row.smtpHost || '',
        port: row.smtpPort || 587,
        secure: row.smtpSecure,
        user: row.smtpUser || '',
        pass: decryptSecret(row.smtpPassword),
      },
    };
  }

  /** Versão para a API/UI — nunca expõe segredos em claro, só flags has*. */
  async getMasked() {
    const row = await this.prisma.emailSettings.findUnique({ where: { id: SINGLETON_ID } });
    const env = this.envDefaults;

    if (!row) {
      return {
        fromName: env.fromName,
        fromEmail: env.fromEmail,
        smtpHost: '',
        smtpPort: null as number | null,
        smtpSecure: true,
        smtpUser: '',
        hasSmtpPassword: false,
        source: 'env' as 'env' | 'db',
        updatedAt: null as Date | null,
      };
    }

    return {
      fromName: row.fromName || '',
      fromEmail: row.fromEmail || '',
      smtpHost: row.smtpHost || '',
      smtpPort: row.smtpPort,
      smtpSecure: row.smtpSecure,
      smtpUser: row.smtpUser || '',
      hasSmtpPassword: !!row.smtpPassword,
      source: 'db' as 'env' | 'db',
      updatedAt: row.updatedAt,
    };
  }

  async update(dto: UpdateEmailSettingsDto, userId?: string) {
    const existing = await this.prisma.emailSettings.findUnique({ where: { id: SINGLETON_ID } });

    if (!dto.fromEmail?.trim()) {
      throw new BadRequestException('Informe o e-mail do remetente.');
    }
    if (!dto.smtpHost?.trim()) throw new BadRequestException('Informe o servidor SMTP (host).');
    if (!dto.smtpPort) throw new BadRequestException('Informe a porta SMTP.');
    if (!dto.smtpUser?.trim()) throw new BadRequestException('Informe o usuário SMTP.');
    if (!dto.smtpPassword && !existing?.smtpPassword) {
      throw new BadRequestException('Informe a senha SMTP.');
    }

    // Segredo: só sobrescreve quando um novo valor é enviado; caso contrário, preserva.
    const smtpPassword = dto.smtpPassword
      ? encryptSecret(dto.smtpPassword)
      : existing?.smtpPassword ?? null;

    const data = {
      fromName: dto.fromName?.trim() || null,
      fromEmail: dto.fromEmail.trim(),
      smtpHost: dto.smtpHost?.trim() || null,
      smtpPort: dto.smtpPort ?? null,
      smtpSecure: dto.smtpSecure ?? true,
      smtpUser: dto.smtpUser?.trim() || null,
      smtpPassword,
      updatedById: userId ?? null,
    };

    await this.prisma.emailSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });

    this.logger.log(`Configuração de e-mail (SMTP) atualizada por ${userId ?? 'desconhecido'}.`);
    return this.getMasked();
  }

  /** Remove a configuração salva no banco — volta a usar o fallback do .env, se houver. */
  async reset(userId?: string) {
    await this.prisma.emailSettings.deleteMany({ where: { id: SINGLETON_ID } });
    this.logger.log(`Configuração de e-mail removida por ${userId ?? 'desconhecido'}.`);
    return this.getMasked();
  }
}
