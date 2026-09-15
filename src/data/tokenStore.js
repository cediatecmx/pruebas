const crypto = require('crypto');
const db = require('./db');
const config = require('../config');

function key() {
  if (!config.sessionSecret) throw new Error('SESSION_SECRET es requerido para proteger tokens OAuth.');
  return crypto.createHash('sha256').update(config.sessionSecret).digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decrypt(payload) {
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8'));
}

async function save(tokenResponse) {
  const record = { ...tokenResponse, expires_at: Date.now() + (tokenResponse.expires_in || 0) * 1000 };
  await db.query(`INSERT INTO oauth_tokens(provider, encrypted_payload, expires_at) VALUES($1,$2,$3)
    ON CONFLICT(provider) DO UPDATE SET encrypted_payload=EXCLUDED.encrypted_payload, expires_at=EXCLUDED.expires_at, updated_at=NOW()`,
    ['mercadolibre', encrypt(record), record.expires_at]);
  return record;
}

async function get() {
  const { rows } = await db.query('SELECT encrypted_payload FROM oauth_tokens WHERE provider=$1', ['mercadolibre']);
  if (!rows[0]) return null;
  try { return decrypt(rows[0].encrypted_payload); } catch (err) { console.error('[tokenStore] token inválido:', err.message); return null; }
}

module.exports = { save, get };
