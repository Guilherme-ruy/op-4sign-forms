import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

/**
 * Criptografia simétrica para segredos guardados no banco (API key, senha SMTP).
 *
 * Usa AES-256-GCM (autenticado) com a chave em `SETTINGS_ENCRYPTION_KEY`.
 * É feita na camada da aplicação, portanto independe do banco (SQLite ou Postgres).
 *
 * Formato armazenado: `enc.v1:<iv>:<authTag>:<ciphertext>` (cada parte em base64).
 * O separador é ':' (nunca aparece no alfabeto base64), pois o próprio prefixo
 * contém um ponto. Rotacionar `SETTINGS_ENCRYPTION_KEY` invalida segredos já gravados.
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // recomendado para GCM
const PREFIX = 'enc.v1';
const SEP = ':';

function getKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY não configurada. Gere uma com: openssl rand -hex 32',
    );
  }
  // Aceita 32 bytes em hex (64 chars) diretamente; senão deriva 32 bytes via SHA-256.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return createHash('sha256').update(raw).digest();
}

/** Retorna true se o valor já está no formato cifrado desta util. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX + SEP);
}

/** Cifra um segredo. String vazia/nula retorna '' (nada a guardar). */
export function encryptSecret(plain: string | null | undefined): string {
  if (plain == null || plain === '') return '';
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(SEP);
}

/**
 * Decifra um segredo. Valores legados em texto plano (não cifrados) são
 * retornados como estão, para tolerar dados inseridos manualmente.
 */
export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!isEncrypted(stored)) return stored;

  const [, ivB64, tagB64, ctB64] = stored.split(SEP);
  if (!ivB64 || !tagB64 || !ctB64) return '';

  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}
