const express = require('express');
const config = require('../config');
const catalogService = require('../services/catalogService');
const pricingService = require('../services/pricingService');
const ordersStore = require('../data/ordersStore');
const distributorsStore = require('../data/distributorsStore');
const fulfillmentService = require('../services/fulfillmentService');
const mercadopago = require('../connectors/mercadopago');
const auth = require('../security/auth');
const { attachDistributorFlag } = require('./distributor');

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

router.get('/products', attachDistributorFlag, async (req, res, next) => {
  try {
    const { q, source, category } = req.query;
    const products = await catalogService.getCatalog({ query: q, source, category, isDistributor: req.isDistributor });
    res.json({ count: products.length, products, isDistributor: req.isDistributor });
  } catch (err) { next(err); }
});

router.get('/products/:id', attachDistributorFlag, async (req, res, next) => {
  try {
    const product = await catalogService.getProductById(req.params.id, req.isDistributor);
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
  let distributorMarkupPercent = null;
  if (body.distributorMarkupPercent !== null && body.distributorMarkupPercent !== '' && body.distributorMarkupPercent !== undefined) {
    distributorMarkupPercent = Number(body.distributorMarkupPercent);
    if (!Number.isFinite(distributorMarkupPercent) || distributorMarkupPercent < 0 || distributorMarkupPercent > 200) {
      return res.status(400).json({ error: 'Margen de distribuidor inválido (0 a 200).' });
    }
  }
  const updated = await pricingService.saveSettings({ globalMarkupPercent: global, markupBySource, distributorMarkupPercent, roundToNine: !!body.roundToNine });
  catalogService.clearCache();
  res.json(updated);
  } catch (err) { next(err); }
});

router.get('/admin/orders', auth.requireAdmin, async (req, res, next) => { try { res.json(await ordersStore.loadAll()); } catch (err) { next(err); } });

// ---------- Admin: estado logístico y sincronización de pago ----------
const allowedOrderStatuses = new Set(['recibido', 'preparando', 'enviado', 'entregado', 'cancelado']);

router.put('/admin/orders/:id/status', auth.requireAdmin, auth.requireSameOrigin, async (req, res, next) => {
  try {
    const order = await ordersStore.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    const orderStatus = String(req.body?.orderStatus || '').trim();
    if (!allowedOrderStatuses.has(orderStatus)) return res.status(400).json({ error: 'Estado de pedido inválido.' });
    const carrier = String(req.body?.carrier || '').trim().slice(0, 100);
    const trackingNumber = String(req.body?.trackingNumber || '').trim().slice(0, 160);
    if (orderStatus === 'enviado' && (!carrier || !trackingNumber)) {
      return res.status(400).json({ error: 'Para marcar como enviado agrega paquetería y número de guía.' });
    }
    const patch = { orderStatus, carrier, trackingNumber };
    if (orderStatus === 'enviado' && !order.shippedAt) patch.shippedAt = new Date().toISOString();
    if (orderStatus === 'entregado' && !order.deliveredAt) patch.deliveredAt = new Date().toISOString();
    res.json(await ordersStore.update(order.id, patch));
  } catch (err) { next(err); }
});

router.post('/admin/orders/:id/sync-payment', auth.requireAdmin, auth.requireSameOrigin, async (req, res, next) => {
  try {
    const order = await ordersStore.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (!order.mpPaymentId) return res.status(400).json({ error: 'Este pedido todavía no tiene un ID de pago de Mercado Pago.' });
    const payment = await mercadopago.getPayment(order.mpPaymentId);
    const paymentMap = { approved: 'pagado', rejected: 'rechazado', refunded: 'reembolsado', cancelled: 'cancelado', pending: 'pendiente', in_process: 'pendiente' };
    const paymentStatus = paymentMap[payment.status] || order.paymentStatus;
    const patch = { paymentStatus, mpPaymentId: String(payment.id || order.mpPaymentId) };
    if (paymentStatus === 'pagado' && order.orderStatus === 'recibido') patch.orderStatus = 'preparando';
    res.json(await ordersStore.update(order.id, patch));
  } catch (err) { next(err); }
});


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

// ---------- Admin: solicitudes de distribuidor ----------
router.get('/admin/distributors', auth.requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    const list = await distributorsStore.listByStatus(status);
    res.json(list.map(distributorsStore.toPublic));
  } catch (err) { next(err); }
});

router.post('/admin/distributors/:id/approve', auth.requireAdmin, auth.requireSameOrigin, async (req, res, next) => {
  try {
    const updated = await distributorsStore.setStatus(req.params.id, 'approved');
    if (!updated) return res.status(404).json({ error: 'Distribuidor no encontrado' });
    res.json(distributorsStore.toPublic(updated));
  } catch (err) { next(err); }
});

router.post('/admin/distributors/:id/reject', auth.requireAdmin, auth.requireSameOrigin, async (req, res, next) => {
  try {
    const updated = await distributorsStore.setStatus(req.params.id, 'rejected');
    if (!updated) return res.status(404).json({ error: 'Distribuidor no encontrado' });
    res.json(distributorsStore.toPublic(updated));
  } catch (err) { next(err); }
});

// ---------- Rastreo público de pedidos (sin necesidad de cuenta) ----------
// Por seguridad pedimos folio + teléfono juntos, para que no cualquiera
// pueda adivinar folios y ver pedidos ajenos.

const lookupAttempts = new Map();

router.post('/orders/lookup', rateLimit(lookupAttempts, 15), async (req, res, next) => {
  try {
    const { orderId, phone } = req.body || {};

    if (!orderId || !phone) {
      return res.status(400).json({
        error: 'Ingresa el folio y el teléfono del pedido.'
      });
    }

    // Buscar el pedido
    const order = await ordersStore.findById(
      String(orderId).trim()
    );

    // Verificar que el teléfono coincida
    const phoneMatches =
      order &&
      String(order.customer?.phone || '').replace(/\D/g, '') ===
        String(phone).replace(/\D/g, '');

    if (!order || !phoneMatches) {
      return res.status(404).json({
        error: 'No encontramos ningún pedido con ese folio y teléfono.'
      });
    }

    // Respuesta pública del pedido
    res.json({
      id: order.id,
      createdAt: order.createdAt,

      // Estados
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus || 'recibido',

      // Información de envío
      carrier: order.carrier || '',
      trackingNumber: order.trackingNumber || '',
      shippedAt: order.shippedAt || null,
      deliveredAt: order.deliveredAt || null,

      // Total
      total: Number(order.total || 0),

      // Productos
      items: (order.items || []).map((it) => {
        const qty = Number(it.qty || 1);
        const price = Number(it.price || 0);

        return {
          id: it.id || '',
          sku: it.sku || '',
          name: it.name || 'Producto',
          description: it.description || '',
          image: it.image || '',

          qty,
          price,

          subtotal: Number(
            it.subtotal ?? (price * qty)
          )
        };
      }),

      // Información de surtido
      fulfillment: (order.fulfillment || []).map((f) => ({
        source: f.source,
        status: f.status,
        supplierOrderId: f.supplierOrderId
      }))
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
