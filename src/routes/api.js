const express = require('express');
const config = require('../config');
const catalogService = require('../services/catalogService');
const pricingService = require('../services/pricingService');
const ordersStore = require('../data/ordersStore');
const fulfillmentService = require('../services/fulfillmentService');
const auth = require('../security/auth');

const router = express.Router();
const loginAttempts = new Map();

function rateLimitLogin(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 15 * 60 * 1000; }
  if (entry.count >= 10) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  entry.count += 1;
  loginAttempts.set(key, entry);
  next();
}

router.post('/admin/login', rateLimitLogin, (req, res) => {
  if (!config.adminPasswordHash || !config.sessionSecret) {
    return res.status(503).json({ error: 'El acceso de administrador no está configurado.' });
  }
  const password = String(req.body?.password || '');
  if (!auth.verifyPassword(password, config.adminPasswordHash)) {
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }
  loginAttempts.delete(req.ip || 'unknown');
  auth.setSessionCookie(res, auth.createSession());
  res.json({ ok: true });
});

router.post('/admin/logout', auth.requireAdmin, auth.requireSameOrigin, (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/admin/session', auth.requireAdmin, (req, res) => res.json({ authenticated: true }));

router.get('/products', async (req, res, next) => {
  try {
    const { q, source, category } = req.query;
    const products = await catalogService.getCatalog({ query: q, source, category });
    res.json({ count: products.length, products });
  } catch (err) { next(err); }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await catalogService.getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(product);
  } catch (err) { next(err); }
});

router.get('/status', (req, res) => {
  res.json({
    syscom: config.syscom.enabled ? 'conectado' : 'modo muestra',
    ctonline: config.ctonline.enabled ? 'conectado' : 'modo muestra',
    tvc: config.tvc.enabled ? 'conectado' : 'modo muestra',
    mercadolibre: config.mercadolibre.enabled ? 'app configurada' : 'sin configurar',
  });
});

router.get('/admin/settings', auth.requireAdmin, async (req, res, next) => { try { res.json(await pricingService.loadSettings()); } catch (err) { next(err); } });

router.put('/admin/settings', auth.requireAdmin, auth.requireSameOrigin, async (req, res, next) => {
  try {
  const body = req.body || {};
  const global = Number(body.globalMarkupPercent);
  if (!Number.isFinite(global) || global < 0 || global > 200) return res.status(400).json({ error: 'Margen global inválido (0 a 200).' });
  const markupBySource = {};
  for (const source of ['syscom', 'ctonline', 'tvc']) {
    const value = body.markupBySource?.[source];
    markupBySource[source] = value === null || value === '' || value === undefined ? null : Number(value);
    if (markupBySource[source] !== null && (!Number.isFinite(markupBySource[source]) || markupBySource[source] < 0 || markupBySource[source] > 200)) {
      return res.status(400).json({ error: `Margen inválido para ${source}.` });
    }
  }
  const updated = await pricingService.saveSettings({ globalMarkupPercent: global, markupBySource, roundToNine: !!body.roundToNine });
  catalogService.clearCache();
  res.json(updated);
  } catch (err) { next(err); }
});

router.get('/admin/orders', auth.requireAdmin, async (req, res, next) => { try { res.json(await ordersStore.loadAll()); } catch (err) { next(err); } });

router.post('/admin/orders/:id/fulfill', auth.requireAdmin, auth.requireSameOrigin, async (req, res) => {
  try { res.json(await fulfillmentService.fulfillOrder(req.params.id)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/orders/:id/mark-manual', auth.requireAdmin, auth.requireSameOrigin, async (req, res, next) => {
  try {
  const { source, supplierOrderId } = req.body || {};
  if (!['syscom', 'ctonline', 'tvc'].includes(source)) return res.status(400).json({ error: 'Proveedor inválido.' });
  const order = await ordersStore.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  const fulfillment = (order.fulfillment || []).map((f) => f.source === source ? { ...f, status: 'manual_ok', supplierOrderId: String(supplierOrderId || '').slice(0, 100) } : f);
  res.json(await ordersStore.update(order.id, { fulfillment }));
  } catch (err) { next(err); }
});

module.exports = router;
