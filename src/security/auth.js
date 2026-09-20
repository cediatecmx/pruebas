const crypto = require('crypto');
const config = require('../config');

const COOKIE_NAME = 'cedia_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function timingSafeEqualText(a, b) {
  const aa = Buffer.from(a || '');
  const bb = Buffer.from(b || '');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function verifyPassword(password, stored) {
  if (!password || !stored || !stored.startsWith('scrypt$')) return false;
  const [, n, r, p, saltB64, hashB64] = stored.split('$');
  const N = Number(n), R = Number(r), P = Number(p);
  if (![N, R, P].every(Number.isInteger) || !saltB64 || !hashB64) return false;
  try {
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const actual = crypto.scryptSync(password, salt, expected.length, { N, r: R, p: P, maxmem: 32 * 1024 * 1024 });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function hashPassword(password) {
  const N = 16384, r = 8, p = 1;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p, maxmem: 32 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

function createSession() {
  const payload = `${Date.now() + SESSION_TTL_MS}.${crypto.randomBytes(16).toString('hex')}`;
  return `${base64url(payload)}.${sign(payload)}`;
}

function verifySession(token) {
  if (!token) return false;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return false;
  let payload;
  try { payload = Buffer.from(encoded, 'base64url').toString('utf8'); } catch { return false; }
  if (!timingSafeEqualText(sign(payload), signature)) return false;
  const [expires] = payload.split('.');
  return Number(expires) > Date.now();
}

function setSessionCookie(res, token) {
  const secure = config.isProduction;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: '/' });
}

function requireAdmin(req, res, next) {
  if (!verifySession(req.cookies?.[COOKIE_NAME])) {
    return res.status(401).json({ error: 'Sesión de administrador inválida o expirada' });
  }
  next();
}

// ---------- Sesiones de distribuidor (separadas de las de admin) ----------
// A diferencia del admin (una sola cuenta fija), un distribuidor tiene
// identidad propia, así que la sesión guarda su id, no solo una expiración.
const DIST_COOKIE_NAME = 'cedia_distributor_session';
const DIST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function createDistributorSession(distributorId) {
  const payload = `${Date.now() + DIST_SESSION_TTL_MS}.${distributorId}.${crypto.randomBytes(12).toString('hex')}`;
  return `${base64url(payload)}.${sign(`dist:${payload}`)}`;
}

// Devuelve el distributorId si la sesión es válida, o null si no lo es.
function verifyDistributorSession(token) {
  if (!token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  let payload;
  try { payload = Buffer.from(encoded, 'base64url').toString('utf8'); } catch { return null; }
  if (!timingSafeEqualText(sign(`dist:${payload}`), signature)) return null;
  const [expires, distributorId] = payload.split('.');
  if (Number(expires) <= Date.now() || !distributorId) return null;
  return distributorId;
}

function setDistributorSessionCookie(res, token) {
  res.cookie(DIST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: DIST_SESSION_TTL_MS,
  });
}

function clearDistributorSessionCookie(res) {
  res.clearCookie(DIST_COOKIE_NAME, { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: '/' });
}

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin && origin !== config.publicOrigin) {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  verifyPassword,
  hashPassword,
  createSession,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin,
  requireSameOrigin,
  DIST_COOKIE_NAME,
  createDistributorSession,
  verifyDistributorSession,
  setDistributorSessionCookie,
  clearDistributorSessionCookie,
};
