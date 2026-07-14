/** Escapa caracteres HTML especiais — usado em qualquer texto livre (admin ou usuário) antes de entrar no e-mail. */
export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TOKEN_RE = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Substitui {{token}} em texto que vai virar HTML: escapa o texto base primeiro
 * (impede que o admin quebre o layout digitando `<`/`&`), depois troca os
 * tokens por valores já escapados — `boldKeys` envolve o valor em <strong>.
 */
export function substituteTokensHtml(
  text: string,
  tokens: Record<string, string>,
  boldKeys: string[] = [],
): string {
  const escaped = escapeHtml(text);
  return escaped.replace(TOKEN_RE, (match, key: string) => {
    if (!(key in tokens)) return match;
    const value = escapeHtml(tokens[key]);
    return boldKeys.includes(key) ? `<strong>${value}</strong>` : value;
  });
}

/** Substitui {{token}} em texto puro (ex.: assunto do e-mail) — sem HTML, sem quebra de linha. */
export function substituteTokensPlain(text: string, tokens: Record<string, string>): string {
  const replaced = text.replace(TOKEN_RE, (match, key: string) => (key in tokens ? tokens[key] : match));
  return replaced.replace(/[\r\n]+/g, ' ').trim();
}

/** Corpo livre (textarea) → parágrafos HTML. Linha em branco separa parágrafos; quebra simples vira <br>. */
export function renderParagraphs(
  body: string,
  tokens: Record<string, string>,
  boldKeys: string[] = [],
): string {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return paragraphs
    .map((p) => {
      const html = substituteTokensHtml(p, tokens, boldKeys).replace(/\n/g, '<br>');
      return `<p style="margin:0 0 20px;font-size:15px;color:#000000;line-height:1.6;">${html}</p>`;
    })
    .join('\n');
}

/** Botão CTA central — mesmo markup usado nos 3 e-mails hoje. */
export function renderButton(url: string, text: string, accentColor: string): string {
  return `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:40px 0;">
                <tr>
                  <td align="center">
                    <a href="${url}" style="display:inline-block;background-color:${accentColor};color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:15px 35px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;">
                      ${escapeHtml(text)}
                    </a>
                  </td>
                </tr>
              </table>`;
}

/** Moldura compartilhada (header com logo + rodapé) — ~90% idêntica nos 4 e-mails hoje. */
export function renderEmailShell(opts: {
  accentColor: string;
  portalName: string;
  logoUrl: string;
  bodyHtml: string;
}): string {
  const { accentColor, portalName, logoUrl, bodyHtml } = opts;
  const safePortalName = escapeHtml(portalName);

  return `
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
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e0e0e0;border-top:4px solid ${accentColor};">

          <tr>
            <td style="padding:40px;border-bottom:1px solid #f0f0f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="150">
                    <img src="${logoUrl}" alt="${safePortalName}" width="150" style="display:block;outline:none;border:none;">
                  </td>
                  <td align="right" style="font-size:14px;font-weight:bold;color:${accentColor};text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">
                    ${safePortalName}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              ${bodyHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:30px 40px;background-color:#f9f9f9;border-top:2px solid ${accentColor};text-align:center;">
              <p style="margin:0 0 10px;font-size:11px;color:#636363;line-height:1.5;">
                Este e-mail foi gerado automaticamente por um sistema de transmissão eletrônica.<br>
                As informações contidas nesta mensagem são para uso exclusivo do destinatário.
              </p>
              <p style="margin:0;font-size:11px;color:${accentColor};font-weight:bold;text-transform:uppercase;letter-spacing:1px;">
                ${safePortalName} &copy; ${new Date().getFullYear()}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
