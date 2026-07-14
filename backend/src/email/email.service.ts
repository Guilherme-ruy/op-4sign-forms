import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailSettingsService, EffectiveEmailConfig } from '../email-settings/email-settings.service';
import { EmailContentService, BOLD_TOKEN_KEYS } from '../email-content/email-content.service';
import { escapeHtml, renderButton, renderEmailShell, renderParagraphs, substituteTokensPlain } from './email-template.util';

interface SendLinkEmailOptions {
  to: { name: string; address: string };
  templateName: string;
  linkUrl: string;
  expiresAt: Date;
}

interface SendPasswordResetEmailOptions {
  to: { name: string; address: string };
  resetUrl: string;
  expiresAt: Date;
}

interface SendInviteEmailOptions {
  to: { name: string; address: string };
  inviteUrl: string;
  expiresAt: Date;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly frontendUrl = process.env.FRONTEND_URL || 'https://documentos.suaempresa.com.br';

  constructor(
    private readonly settings: EmailSettingsService,
    private readonly contentService: EmailContentService,
  ) {}

  async sendLinkEmail(opts: SendLinkEmailOptions): Promise<boolean> {
    if (!opts.to.address) {
      this.logger.warn(`E-mail não enviado: destinatário ausente.`);
      return false;
    }

    const expireStr = opts.expiresAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const content = await this.contentService.getEffective();
    const { accentColor, portalDisplayName } = content;
    const tokens = { templateName: opts.templateName, portalName: portalDisplayName };
    const logoUrl = `${this.frontendUrl}/logo_horizontal.png`;

    const bodyHtml = `
              <p style="margin:0 0 20px;font-size:16px;color:#000000;">Prezado(a),</p>

              <h2 style="margin:0 0 20px;font-size:20px;color:${accentColor};font-weight:bold;line-height:1.4;">
                ${escapeHtml(content.link.title)}
              </h2>

              ${renderParagraphs(content.link.body, tokens, BOLD_TOKEN_KEYS)}

              ${renderButton(opts.linkUrl, content.link.buttonText, accentColor)}

              <!-- Details Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:30px;border:1px solid #f0f0f0;">
                <tr style="background-color:#fafafa;">
                  <td style="padding:12px 15px;font-size:13px;color:#636363;font-weight:bold;width:120px;border-bottom:1px solid #f0f0f0;">PROCESSO</td>
                  <td style="padding:12px 15px;font-size:13px;color:#000000;border-bottom:1px solid #f0f0f0;">${escapeHtml(opts.templateName)}</td>
                </tr>
                <tr>
                  <td style="padding:12px 15px;font-size:13px;color:#636363;font-weight:bold;border-bottom:1px solid #f0f0f0;">VALIDADE</td>
                  <td style="padding:12px 15px;font-size:13px;color:#D97706;font-weight:bold;border-bottom:1px solid #f0f0f0;">${expireStr}</td>
                </tr>
              </table>

              <!-- Safety Link -->
              <p style="margin:0;font-size:12px;color:#636363;line-height:1.6;">
                Caso não consiga clicar no botão, utilize o endereço abaixo em seu navegador:<br>
                <a href="${opts.linkUrl}" style="color:${accentColor};text-decoration:underline;">${opts.linkUrl}</a>
              </p>`;

    const htmlbody = renderEmailShell({ accentColor, portalName: portalDisplayName, logoUrl, bodyHtml });
    const subject = substituteTokensPlain(content.link.subject, tokens);

    return this.dispatch({
      to: opts.to,
      subject,
      htmlbody,
    });
  }

  async sendPasswordResetEmail(opts: SendPasswordResetEmailOptions): Promise<boolean> {
    if (!opts.to.address) {
      this.logger.warn('E-mail de redefinição não enviado: destinatário ausente.');
      return false;
    }

    const expireStr = opts.expiresAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const content = await this.contentService.getEffective();
    const { accentColor, portalDisplayName } = content;
    const tokens = { recipientName: opts.to.name, portalName: portalDisplayName };
    const logoUrl = `${this.frontendUrl}/logo_horizontal.png`;

    const bodyHtml = `
            <p style="margin:0 0 20px;font-size:16px;color:#000;">Prezado(a) <strong>${escapeHtml(opts.to.name)}</strong>,</p>
            <h2 style="margin:0 0 20px;font-size:20px;color:${accentColor};font-weight:bold;">${escapeHtml(content.reset.title)}</h2>
            ${renderParagraphs(content.reset.body, tokens, BOLD_TOKEN_KEYS)}
            ${renderButton(opts.resetUrl, content.reset.buttonText, accentColor)}
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:30px;border:1px solid #f0f0f0;">
              <tr style="background:#fafafa;">
                <td style="padding:12px 15px;font-size:13px;color:#636363;font-weight:bold;width:120px;border-bottom:1px solid #f0f0f0;">VALIDADE</td>
                <td style="padding:12px 15px;font-size:13px;color:#D97706;font-weight:bold;border-bottom:1px solid #f0f0f0;">${expireStr}</td>
              </tr>
            </table>
            <p style="margin:0 0 10px;font-size:13px;color:#636363;line-height:1.6;">
              Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha permanecerá a mesma.
            </p>
            <p style="margin:0;font-size:12px;color:#636363;line-height:1.6;">
              Caso não consiga clicar no botão, copie o link abaixo no navegador:<br>
              <a href="${opts.resetUrl}" style="color:${accentColor};">${opts.resetUrl}</a>
            </p>`;

    const htmlbody = renderEmailShell({ accentColor, portalName: portalDisplayName, logoUrl, bodyHtml });
    const subject = substituteTokensPlain(content.reset.subject, tokens);

    return this.dispatch({ to: opts.to, subject, htmlbody });
  }

  async sendInviteEmail(opts: SendInviteEmailOptions): Promise<boolean> {
    if (!opts.to.address) {
      this.logger.warn('E-mail de convite não enviado: destinatário ausente.');
      return false;
    }

    const expireStr = opts.expiresAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const content = await this.contentService.getEffective();
    const { accentColor, portalDisplayName } = content;
    const tokens = { recipientName: opts.to.name, portalName: portalDisplayName };
    const logoUrl = `${this.frontendUrl}/logo_horizontal.png`;

    const bodyHtml = `
            <p style="margin:0 0 20px;font-size:16px;color:#000;">Prezado(a) <strong>${escapeHtml(opts.to.name)}</strong>,</p>
            <h2 style="margin:0 0 20px;font-size:20px;color:${accentColor};font-weight:bold;">${escapeHtml(content.invite.title)}</h2>
            ${renderParagraphs(content.invite.body, tokens, BOLD_TOKEN_KEYS)}
            ${renderButton(opts.inviteUrl, content.invite.buttonText, accentColor)}
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:30px;border:1px solid #f0f0f0;">
              <tr style="background:#fafafa;">
                <td style="padding:12px 15px;font-size:13px;color:#636363;font-weight:bold;width:120px;border-bottom:1px solid #f0f0f0;">VALIDADE</td>
                <td style="padding:12px 15px;font-size:13px;color:#D97706;font-weight:bold;border-bottom:1px solid #f0f0f0;">${expireStr}</td>
              </tr>
            </table>
            <p style="margin:0 0 10px;font-size:13px;color:#636363;line-height:1.6;">
              Este convite é pessoal e intransferível. Após a criação da conta, você poderá acessar o portal com suas credenciais.
            </p>
            <p style="margin:0;font-size:12px;color:#636363;line-height:1.6;">
              Caso não consiga clicar no botão, copie o link abaixo no navegador:<br>
              <a href="${opts.inviteUrl}" style="color:${accentColor};">${opts.inviteUrl}</a>
            </p>`;

    const htmlbody = renderEmailShell({ accentColor, portalName: portalDisplayName, logoUrl, bodyHtml });
    const subject = substituteTokensPlain(content.invite.subject, tokens);

    return this.dispatch({
      to: opts.to,
      subject,
      htmlbody,
    });
  }

  /** Envia um e-mail de teste com a configuração ativa (usado pela tela /admin/email). */
  async sendTestEmail(to: { name?: string; address: string }): Promise<boolean> {
    const content = await this.contentService.getEffective();
    const { accentColor, portalDisplayName } = content;
    const logoUrl = `${this.frontendUrl}/logo_horizontal.png`;

    const bodyHtml = `
            <h2 style="margin:0 0 20px;font-size:20px;color:${accentColor};font-weight:bold;">Configuração de e-mail funcionando ✓</h2>
            <p style="margin:0 0 20px;font-size:15px;color:#000;line-height:1.6;">
              Este é um e-mail de teste do <strong>${escapeHtml(portalDisplayName)}</strong>. Se você recebeu esta mensagem,
              o envio está configurado corretamente.
            </p>
            <p style="margin:0;font-size:13px;color:#636363;line-height:1.6;">
              Enviado em ${new Date().toLocaleString('pt-BR')}.
            </p>`;

    const htmlbody = renderEmailShell({ accentColor, portalName: portalDisplayName, logoUrl, bodyHtml });

    return this.dispatch({
      to: { name: to.name || to.address, address: to.address },
      subject: `Teste de configuração de e-mail — ${portalDisplayName}`,
      htmlbody,
    });
  }

  // ── Transporte ──────────────────────────────────────────────────────────
  private async dispatch(msg: {
    to: { name?: string; address: string };
    subject: string;
    htmlbody: string;
  }): Promise<boolean> {
    if (!msg.to.address) {
      this.logger.warn('E-mail não enviado: destinatário ausente.');
      return false;
    }
    const cfg = await this.settings.getEffective();
    return this.sendViaSmtp(cfg, msg);
  }

  private async sendViaSmtp(
    cfg: EffectiveEmailConfig,
    msg: { to: { name?: string; address: string }; subject: string; htmlbody: string },
  ): Promise<boolean> {
    if (!cfg.smtp.host || !cfg.smtp.user) {
      this.logger.warn('E-mail (SMTP) não enviado: configuração SMTP incompleta.');
      return false;
    }
    try {
      const transporter = nodemailer.createTransport({
        host: cfg.smtp.host,
        port: cfg.smtp.port,
        secure: cfg.smtp.secure, // true p/ 465; false p/ 587 (STARTTLS)
        auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
      });
      const info = await transporter.sendMail({
        from: { name: cfg.fromName, address: cfg.fromEmail },
        to: msg.to.name ? `"${msg.to.name}" <${msg.to.address}>` : msg.to.address,
        subject: msg.subject,
        html: msg.htmlbody,
      });
      this.logger.log(`E-mail (SMTP) enviado para ${msg.to.address} — messageId: ${info.messageId}`);
      return true;
    } catch (err: any) {
      this.logger.error(`Falha ao enviar e-mail (SMTP) para ${msg.to.address}: ${err.message}`);
      return false;
    }
  }
}
