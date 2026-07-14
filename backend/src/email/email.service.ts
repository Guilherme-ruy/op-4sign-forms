import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailSettingsService, EffectiveEmailConfig } from '../email-settings/email-settings.service';

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

  constructor(private readonly settings: EmailSettingsService) {}

  async sendLinkEmail(opts: SendLinkEmailOptions): Promise<boolean> {
    if (!opts.to.address) {
      this.logger.warn(`E-mail não enviado: destinatário ausente.`);
      return false;
    }

    const expireStr = opts.expiresAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const logoUrl = `${this.frontendUrl}/logo_horizontal.png`;

    const htmlbody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial, sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 10px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e0e0e0;border-top:4px solid #0A0A0A;">

          <!-- Header (Minimalist) -->
          <tr>
            <td style="padding:40px;border-bottom:1px solid #f0f0f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="150">
                    <img src="${logoUrl}" alt="Portal" width="150" style="display:block;outline:none;border:none;">
                  </td>
                  <td align="right" style="font-size:14px;font-weight:bold;color:#0A0A0A;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">
                    Portal de Documentos
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;font-size:16px;color:#000000;">Prezado(a),</p>

              <h2 style="margin:0 0 20px;font-size:20px;color:#0A0A0A;font-weight:bold;line-height:1.4;">
                Solicitação de Preenchimento de Documento
              </h2>

              <p style="margin:0 0 20px;font-size:15px;color:#000000;line-height:1.6;">
                Informamos que o documento <strong>${opts.templateName}</strong> está disponível para preenchimento.
              </p>

              <p style="margin:0 0 30px;font-size:15px;color:#000000;line-height:1.6;">
                Solicitamos que acesse o portal através do link seguro abaixo para completar o envio das informações necessárias para a formalização do processo.
              </p>

              <!-- Formal CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:40px 0;">
                <tr>
                  <td align="center">
                    <a href="${opts.linkUrl}" style="display:inline-block;background-color:#0A0A0A;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:15px 35px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;">
                      Acessar Documento →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Details Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:30px;border:1px solid #f0f0f0;">
                <tr style="background-color:#fafafa;">
                  <td style="padding:12px 15px;font-size:13px;color:#636363;font-weight:bold;width:120px;border-bottom:1px solid #f0f0f0;">PROCESSO</td>
                  <td style="padding:12px 15px;font-size:13px;color:#000000;border-bottom:1px solid #f0f0f0;">${opts.templateName}</td>
                </tr>
                <tr>
                  <td style="padding:12px 15px;font-size:13px;color:#636363;font-weight:bold;border-bottom:1px solid #f0f0f0;">VALIDADE</td>
                  <td style="padding:12px 15px;font-size:13px;color:#D97706;font-weight:bold;border-bottom:1px solid #f0f0f0;">${expireStr}</td>
                </tr>
              </table>

              <!-- Safety Link -->
              <p style="margin:0;font-size:12px;color:#636363;line-height:1.6;">
                Caso não consiga clicar no botão, utilize o endereço abaixo em seu navegador:<br>
                <a href="${opts.linkUrl}" style="color:#0A0A0A;text-decoration:underline;">${opts.linkUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:30px 40px;background-color:#f9f9f9;border-top:2px solid #0A0A0A;text-align:center;">
              <p style="margin:0 0 10px;font-size:11px;color:#636363;line-height:1.5;">
                Este e-mail foi gerado automaticamente por um sistema de transmissão eletrônica.<br>
                As informações contidas nesta mensagem são para uso exclusivo do destinatário.
              </p>
              <p style="margin:0;font-size:11px;color:#0A0A0A;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">
                Portal de Documentos &copy; ${new Date().getFullYear()}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.dispatch({
      to: opts.to,
      subject: `Documento para preenchimento: ${opts.templateName}`,
      htmlbody,
    });
  }

  async sendPasswordResetEmail(opts: SendPasswordResetEmailOptions): Promise<boolean> {
    if (!opts.to.address) {
      this.logger.warn('E-mail de redefinição não enviado: destinatário ausente.');
      return false;
    }

    const expireStr = opts.expiresAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const logoUrl = `${this.frontendUrl}/logo_horizontal.png`;

    const htmlbody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 10px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e0e0e0;border-top:4px solid #0A0A0A;">
        <tr>
          <td style="padding:40px;border-bottom:1px solid #f0f0f0;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td width="150"><img src="${logoUrl}" alt="Portal" width="150" style="display:block;border:none;"></td>
              <td align="right" style="font-size:14px;font-weight:bold;color:#0A0A0A;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">Portal de Documentos</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 20px;font-size:16px;color:#000;">Prezado(a) <strong>${opts.to.name}</strong>,</p>
            <h2 style="margin:0 0 20px;font-size:20px;color:#0A0A0A;font-weight:bold;">Redefinição de Senha</h2>
            <p style="margin:0 0 20px;font-size:15px;color:#000;line-height:1.6;">
              Recebemos uma solicitação para redefinir a senha da sua conta no <strong>Portal de Documentos</strong>.<br>
              Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong>2 horas</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:40px 0;">
              <tr><td align="center">
                <a href="${opts.resetUrl}" style="display:inline-block;background-color:#0A0A0A;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:15px 35px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;">
                  Redefinir Senha →
                </a>
              </td></tr>
            </table>
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
              <a href="${opts.resetUrl}" style="color:#0A0A0A;">${opts.resetUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 40px;background:#f9f9f9;border-top:2px solid #0A0A0A;text-align:center;">
            <p style="margin:0 0 10px;font-size:11px;color:#636363;line-height:1.5;">
              Este e-mail foi gerado automaticamente. Não responda esta mensagem.
            </p>
            <p style="margin:0;font-size:11px;color:#0A0A0A;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">
              Portal de Documentos &copy; ${new Date().getFullYear()}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return this.dispatch({ to: opts.to, subject: 'Redefinição de senha', htmlbody });
  }

  async sendInviteEmail(opts: SendInviteEmailOptions): Promise<boolean> {
    if (!opts.to.address) {
      this.logger.warn('E-mail de convite não enviado: destinatário ausente.');
      return false;
    }

    const expireStr = opts.expiresAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const logoUrl = `${this.frontendUrl}/logo_horizontal.png`;

    const htmlbody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 10px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e0e0e0;border-top:4px solid #0A0A0A;">
        <tr>
          <td style="padding:40px;border-bottom:1px solid #f0f0f0;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td width="150"><img src="${logoUrl}" alt="Portal" width="150" style="display:block;border:none;"></td>
              <td align="right" style="font-size:14px;font-weight:bold;color:#0A0A0A;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">Portal de Documentos</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 20px;font-size:16px;color:#000;">Prezado(a) <strong>${opts.to.name}</strong>,</p>
            <h2 style="margin:0 0 20px;font-size:20px;color:#0A0A0A;font-weight:bold;">Convite para o Portal de Documentos</h2>
            <p style="margin:0 0 20px;font-size:15px;color:#000;line-height:1.6;">
              Você foi convidado(a) para acessar o <strong>Portal de Documentos</strong>.<br>
              Clique no botão abaixo para criar sua conta e começar a utilizar o sistema.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:40px 0;">
              <tr><td align="center">
                <a href="${opts.inviteUrl}" style="display:inline-block;background-color:#0A0A0A;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:15px 35px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;">
                  Criar Minha Conta →
                </a>
              </td></tr>
            </table>
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
              <a href="${opts.inviteUrl}" style="color:#0A0A0A;">${opts.inviteUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 40px;background:#f9f9f9;border-top:2px solid #0A0A0A;text-align:center;">
            <p style="margin:0 0 10px;font-size:11px;color:#636363;line-height:1.5;">
              Este e-mail foi gerado automaticamente. Não responda esta mensagem.
            </p>
            <p style="margin:0;font-size:11px;color:#0A0A0A;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">
              Portal de Documentos &copy; ${new Date().getFullYear()}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return this.dispatch({
      to: opts.to,
      subject: 'Convite para acesso ao Portal de Documentos',
      htmlbody,
    });
  }

  /** Envia um e-mail de teste com a configuração ativa (usado pela tela /admin/email). */
  async sendTestEmail(to: { name?: string; address: string }): Promise<boolean> {
    const logoUrl = `${this.frontendUrl}/logo_horizontal.png`;
    const htmlbody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 10px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e0e0e0;border-top:4px solid #0A0A0A;">
        <tr>
          <td style="padding:40px;border-bottom:1px solid #f0f0f0;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td width="150"><img src="${logoUrl}" alt="Portal" width="150" style="display:block;border:none;"></td>
              <td align="right" style="font-size:14px;font-weight:bold;color:#0A0A0A;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">Portal de Documentos</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 20px;font-size:20px;color:#0A0A0A;font-weight:bold;">Configuração de e-mail funcionando ✓</h2>
            <p style="margin:0 0 20px;font-size:15px;color:#000;line-height:1.6;">
              Este é um e-mail de teste do <strong>Portal de Documentos</strong>. Se você recebeu esta mensagem,
              o envio está configurado corretamente.
            </p>
            <p style="margin:0;font-size:13px;color:#636363;line-height:1.6;">
              Enviado em ${new Date().toLocaleString('pt-BR')}.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 40px;background:#f9f9f9;border-top:2px solid #0A0A0A;text-align:center;">
            <p style="margin:0;font-size:11px;color:#0A0A0A;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">
              Portal de Documentos &copy; ${new Date().getFullYear()}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return this.dispatch({
      to: { name: to.name || to.address, address: to.address },
      subject: 'Teste de configuração de e-mail — Portal de Documentos',
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
