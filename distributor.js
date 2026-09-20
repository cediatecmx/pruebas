const express = require('express');
const config = require('../config');
const auth = require('../security/auth');
const distributorsStore = require('../data/distributorsStore');

const router = express.Router();
const loginAttempts = new Map();

function rateLimit(map, max) {
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = map.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 15 * 60 * 1000; }
    if (entry.count >= max) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
    entry.count += 1;
    map.set(key, entry);
    next();
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', rateLimit(loginAttempts, 8), async (req, res, next) => {
  try {
    const { businessName, contactName, email, phone, rfc, password } = req.body || {};
    if (!businessName || !contactName || !email || !phone || !password) {
      return res.status(400).json({ error: 'Faltan datos obligatorios (empresa, contacto, correo, teléfono, contraseña).' });
    }
    if (!EMAIL_RE.test(String(email))) return res.status(400).json({ error: 'El correo no es válido.' });
    if (String(password).length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });

    const existing = await distributorsStore.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Ya hay una cuenta registrada con ese correo.' });

    const passwordHash = auth.hashPassword(String(password));
    const distributor = await distributorsStore.create({ businessName, contactName, email, phone, rfc, passwordHash });

    res.status(201).json({
      ok: true,
      message: 'Tu solicitud fue enviada. Te avisaremos cuando sea aprobada para que puedas iniciar sesión con precios de distribuidor.',
      status: distributorsStore.toPublic(distributor).status,
    });
  } catch (err) { next(err); }
});

router.post('/login', rateLimit(loginAttempts, 10), async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const distributor = await distributorsStore.findByEmail(String(email || ''));

    if (!distributor || !auth.verifyPassword(String(password || ''), distributor.passwordHash)) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    if (distributor.status === 'pending') {
      return res.status(403).json({ error: 'Tu cuenta todavía está en revisión. Te avisaremos por correo cuando sea aprobada.' });
    }
    if (distributor.status === 'rejected') {
      return res.status(403).json({ error: 'Tu solicitud de distribuidor no fue aprobada. Contáctanos si crees que es un error.' });
    }

    auth.setDistributorSessionCookie(res, auth.createDistributorSession(distributor.id));
    res.json({ ok: true, businessName: distributor.businessName });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  auth.clearDistributorSessionCookie(res);
  res.json({ ok: true });
});

router.get('/session', async (req, res, next) => {
  try {
    const distributorId = auth.verifyDistributorSession(req.cookies?.[auth.DIST_COOKIE_NAME]);
    if (!distributorId) return res.status(401).json({ authenticated: false });

    const distributor = await distributorsStore.findById(distributorId);
    if (!distributor || distributor.status !== 'approved') {
      auth.clearDistributorSessionCookie(res);
      return res.status(401).json({ authenticated: false });
    }
    res.json({ authenticated: true, businessName: distributor.businessName, email: distributor.email });
  } catch (err) { next(err); }
});

// Middleware no bloqueante: si hay una sesión de distribuidor válida y
// aprobada, marca req.isDistributor = true (para aplicar precios de
// mayoreo). Si no hay sesión o no es válida, sigue como cliente normal.
async function attachDistributorFlag(req, res, next) {
  try {
    const distributorId = auth.verifyDistributorSession(req.cookies?.[auth.DIST_COOKIE_NAME]);
    if (distributorId) {
      const distributor = await distributorsStore.findById(distributorId);
      req.isDistributor = !!distributor && distributor.status === 'approved';
    } else {
      req.isDistributor = false;
    }
  } catch {
    req.isDistributor = false;
  }
  next();
}

module.exports = router;
module.exports.attachDistributorFlag = attachDistributorFlag;
