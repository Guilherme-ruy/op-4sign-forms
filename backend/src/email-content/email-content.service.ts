import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  escapeHtml,
  renderButton,
  renderEmailShell,
  renderParagraphs,
  substituteTokensPlain,
} from '../email/email-template.util';

export interface EmailTypeContent {
  subject: string;
  title: string;
  body: string;
  buttonText: string;
}

export interface EffectiveEmailContent {
  accentColor: string;
  portalDisplayName: string;
  link: EmailTypeContent;
  reset: EmailTypeContent;
  invite: EmailTypeContent;
}

export interface UpdateEmailContentDto {
  accentColor?: string;
  portalDisplayName?: string;
  linkSubject?: string;
  linkTitle?: string;
  linkBody?: string;
  linkButtonText?: string;
  resetSubject?: string;
  resetTitle?: string;
  resetBody?: string;
  resetButtonText?: string;
  inviteSubject?: string;
  inviteTitle?: string;
  inviteBody?: string;
  inviteButtonText?: string;
}

export interface PreviewEmailContentDto {
  type: 'link' | 'reset' | 'invite';
  subject?: string;
  title?: string;
  body?: string;
  buttonText?: string;
  accentColor?: string;
  portalDisplayName?: string;
}

const SINGLETON_ID = 'singleton';

/** Tokens que ganham <strong> ao serem substituídos no corpo — mantém o destaque visual do texto padrão. */
const BOLD_TOKEN_KEYS = ['templateName', 'recipientName', 'portalName'];

/** Textos padrão — idênticos ao que estava hardcoded em email.service.ts antes desta feature. */
export const EMAIL_CONTENT_DEFAULTS: {
  accentColor: string;
  portalDisplayName: string;
  link: EmailTypeContent;
  reset: EmailTypeContent;
  invite: EmailTypeContent;
} = {
  accentColor: '#0A0A0A',
  portalDisplayName: 'Portal de Documentos',
  link: {
    subject: 'Documento para preenchimento: {{templateName}}',
    title: 'Solicitação de Preenchimento de Documento',
    body:
      'Informamos que o documento {{templateName}} está disponível para preenchimento.\n\n' +
      'Solicitamos que acesse o portal através do link seguro abaixo para completar o envio das informações necessárias para a formalização do processo.',
    buttonText: 'Acessar Documento →',
  },
  reset: {
    subject: 'Redefinição de senha',
    title: 'Redefinição de Senha',
    body:
      'Recebemos uma solicitação para redefinir a senha da sua conta no {{portalName}}. ' +
      'Clique no botão abaixo para criar uma nova senha. Este link é válido por 2 horas.',
    buttonText: 'Redefinir Senha →',
  },
  invite: {
    subject: 'Convite para acesso ao {{portalName}}',
    title: 'Convite para o Portal de Documentos',
    body:
      'Você foi convidado(a) para acessar o {{portalName}}. ' +
      'Clique no botão abaixo para criar sua conta e começar a utilizar o sistema.',
    buttonText: 'Criar Minha Conta →',
  },
};

const FIELD_LIMITS = { subject: 200, title: 150, body: 2000, buttonText: 60, portalDisplayName: 100 };

@Injectable()
export class EmailContentService {
  private readonly logger = new Logger(EmailContentService.name);
  private readonly frontendUrl = process.env.FRONTEND_URL || 'https://documentos.suaempresa.com.br';

  constructor(private prisma: PrismaService) {}

  private mergeWithDefaults(row: {
    accentColor: string | null;
    portalDisplayName: string | null;
    linkSubject: string | null;
    linkTitle: string | null;
    linkBody: string | null;
    linkButtonText: string | null;
    resetSubject: string | null;
    resetTitle: string | null;
    resetBody: string | null;
    resetButtonText: string | null;
    inviteSubject: string | null;
    inviteTitle: string | null;
    inviteBody: string | null;
    inviteButtonText: string | null;
  } | null): EffectiveEmailContent {
    const d = EMAIL_CONTENT_DEFAULTS;
    if (!row) {
      return { accentColor: d.accentColor, portalDisplayName: d.portalDisplayName, link: { ...d.link }, reset: { ...d.reset }, invite: { ...d.invite } };
    }
    return {
      accentColor: row.accentColor || d.accentColor,
      portalDisplayName: row.portalDisplayName || d.portalDisplayName,
      link: {
        subject: row.linkSubject || d.link.subject,
        title: row.linkTitle || d.link.title,
        body: row.linkBody || d.link.body,
        buttonText: row.linkButtonText || d.link.buttonText,
      },
      reset: {
        subject: row.resetSubject || d.reset.subject,
        title: row.resetTitle || d.reset.title,
        body: row.resetBody || d.reset.body,
        buttonText: row.resetButtonText || d.reset.buttonText,
      },
      invite: {
        subject: row.inviteSubject || d.invite.subject,
        title: row.inviteTitle || d.invite.title,
        body: row.inviteBody || d.invite.body,
        buttonText: row.inviteButtonText || d.invite.buttonText,
      },
    };
  }

  /** Config efetiva para montar os e-mails reais (DB sobre os padrões). */
  async getEffective(): Promise<EffectiveEmailContent> {
    const row = await this.prisma.emailContentSettings.findUnique({ where: { id: SINGLETON_ID } });
    return this.mergeWithDefaults(row);
  }

  /** Versão para a API/UI — nada aqui é segredo, então é igual à efetiva + metadados. */
  async getMasked() {
    const row = await this.prisma.emailContentSettings.findUnique({ where: { id: SINGLETON_ID } });
    return {
      ...this.mergeWithDefaults(row),
      source: row ? ('db' as const) : ('default' as const),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async update(dto: UpdateEmailContentDto, userId?: string) {
    const accentColor = dto.accentColor?.trim();
    if (accentColor && !/^#[0-9A-Fa-f]{6}$/.test(accentColor)) {
      throw new BadRequestException('Cor de destaque inválida — use um hex de 6 dígitos, ex: #0A0A0A.');
    }

    const clean = (value: string | undefined, max: number): string | null => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      if (trimmed.length > max) {
        throw new BadRequestException(`Texto excede o limite de ${max} caracteres.`);
      }
      return trimmed;
    };

    const data = {
      accentColor: accentColor || null,
      portalDisplayName: clean(dto.portalDisplayName, FIELD_LIMITS.portalDisplayName),
      linkSubject: clean(dto.linkSubject, FIELD_LIMITS.subject),
      linkTitle: clean(dto.linkTitle, FIELD_LIMITS.title),
      linkBody: clean(dto.linkBody, FIELD_LIMITS.body),
      linkButtonText: clean(dto.linkButtonText, FIELD_LIMITS.buttonText),
      resetSubject: clean(dto.resetSubject, FIELD_LIMITS.subject),
      resetTitle: clean(dto.resetTitle, FIELD_LIMITS.title),
      resetBody: clean(dto.resetBody, FIELD_LIMITS.body),
      resetButtonText: clean(dto.resetButtonText, FIELD_LIMITS.buttonText),
      inviteSubject: clean(dto.inviteSubject, FIELD_LIMITS.subject),
      inviteTitle: clean(dto.inviteTitle, FIELD_LIMITS.title),
      inviteBody: clean(dto.inviteBody, FIELD_LIMITS.body),
      inviteButtonText: clean(dto.inviteButtonText, FIELD_LIMITS.buttonText),
      updatedById: userId ?? null,
    };

    await this.prisma.emailContentSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });

    this.logger.log(`Personalização de e-mail atualizada por ${userId ?? 'desconhecido'}.`);
    return this.getMasked();
  }

  /** Remove a personalização salva — volta a usar o texto padrão. */
  async reset(userId?: string) {
    await this.prisma.emailContentSettings.deleteMany({ where: { id: SINGLETON_ID } });
    this.logger.log(`Personalização de e-mail restaurada ao padrão por ${userId ?? 'desconhecido'}.`);
    return this.getMasked();
  }

  private sampleTokensFor(type: PreviewEmailContentDto['type'], portalName: string): Record<string, string> {
    if (type === 'link') return { portalName, templateName: 'Contrato de Prestação de Serviços' };
    return { portalName, recipientName: 'Maria Souza' };
  }

  /** Renderização pura de um rascunho (sem salvar) — usa os mesmos helpers dos envios reais. */
  preview(dto: PreviewEmailContentDto): { subject: string; html: string } {
    if (!['link', 'reset', 'invite'].includes(dto.type)) {
      throw new BadRequestException('Tipo de e-mail inválido.');
    }

    const defaults = EMAIL_CONTENT_DEFAULTS[dto.type];
    const accentColor = dto.accentColor?.trim() || EMAIL_CONTENT_DEFAULTS.accentColor;
    const portalName = dto.portalDisplayName?.trim() || EMAIL_CONTENT_DEFAULTS.portalDisplayName;
    const title = dto.title?.trim() || defaults.title;
    const body = dto.body?.trim() || defaults.body;
    const buttonText = dto.buttonText?.trim() || defaults.buttonText;
    const subjectRaw = dto.subject?.trim() || defaults.subject;

    const tokens = this.sampleTokensFor(dto.type, portalName);
    const subject = substituteTokensPlain(subjectRaw, tokens);
    const logoUrl = `${this.frontendUrl}/logo_horizontal.png`;

    const bodyHtml = `
              <h2 style="margin:0 0 20px;font-size:20px;color:${accentColor};font-weight:bold;line-height:1.4;">${escapeHtml(title)}</h2>
              ${renderParagraphs(body, tokens, BOLD_TOKEN_KEYS)}
              ${renderButton('#', buttonText, accentColor)}`;

    const html = renderEmailShell({ accentColor, portalName, logoUrl, bodyHtml });
    return { subject, html };
  }
}

export { BOLD_TOKEN_KEYS };
