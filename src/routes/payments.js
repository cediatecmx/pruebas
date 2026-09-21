const express = require('express');
const config = require('../config');
const mercadopago = require('../connectors/mercadopago');
const ordersStore = require('../data/ordersStore');
const fulfillmentService = require('../services/fulfillmentService');
const inventoryService = require('../services/inventoryService');
const catalogService = require('../services/catalogService');
const { validateMercadoPagoSignature } = require('../security/webhook');
const { attachDistributorFlag } = require('./distributor');

const router = express.Router();
const checkoutRate = new Map();

function checkoutThrottle(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const entry = checkoutRate.get(key) || { count: 0, resetAt: now + 10 * 60 * 1000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 10 * 60 * 1000; }
  if (entry.count >= 20) return res.status(429).json({ error: 'Demasiados intentos de checkout. Intenta de nuevo más tarde.' });
  entry.count += 1;
  checkoutRate.set(key, entry);
  next();
}

function clean(value, max) { return String(value ?? '').trim().slice(0, max); }

function normalizeCheckoutError(err) {
  const data = err?.response?.data;
  if (data !== undefined) {
    if (typeof data === 'string') return { message: data.slice(0, 2000) };
    try { JSON.stringify(data); return data; } catch (_) {}
  }
  return { message: String(err?.message || 'Error desconocido').slice(0, 2000) };
}

async function validateAndPriceItems(items, isDistributor = false) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) throw new Error('Carrito inválido.');
  const normalized = [];
  for (const item of items) {
    const id = clean(item?.id, 160);
    const qty = Number(item?.qty);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 50) throw new Error('Cantidad de producto inválida.');
    const product = await catalogService.getProductById(id, isDistributor);
    if (!product) throw new Error(`Producto no disponible: ${id}`);
    if (!Number.isFinite(product.price) || product.price < 0) throw new Error(`Precio inválido para ${id}`);
    if (Number(product.stock) < qty) throw new Error(`No hay inventario suficiente para ${product.name}. Disponible: ${product.stock}.`);
    normalized.push({
  id: product.id,
  sku: product.sku || '',
  name: product.name,
  description: product.description || '',
  image: Array.isArray(product.images)
    ? (product.images[0] || '')
    : (product.image || ''),
  price: Number(product.price),
  qty,
  subtotal: Number(product.price) * qty
});
  }
  return normalized;
}

router.post('/checkout', checkoutThrottle, attachDistributorFlag, async (req, res) => {
  try {
    const { customer, shippingAddress, notes } = req.body || {};
    const safeCustomer = {
      name: clean(customer?.name, 120),
      phone: clean(customer?.phone, 30),
      email: customer?.email ? clean(customer.email, 160) : undefined,
    };
    if (safeCustomer.name.length < 2 || safeCustomer.phone.length < 7) return res.status(400).json({ error: 'Datos del cliente inválidos.' });
    if (safeCustomer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeCustomer.email)) return res.status(400).json({ error: 'Correo electrónico inválido.' });

    const safeAddress = {
      nombre: clean(shippingAddress?.nombre || safeCustomer.name, 120),
      calle: clean(shippingAddress?.calle, 160), numero: clean(shippingAddress?.numero, 30),
      colonia: clean(shippingAddress?.colonia, 120), ciudad: clean(shippingAddress?.ciudad, 100),
      estado: clean(shippingAddress?.estado, 100), cp: clean(shippingAddress?.cp, 10), telefono: safeCustomer.phone,
    };
    if (!safeAddress.calle || !safeAddress.cp || !safeAddress.ciudad || !safeAddress.estado) return res.status(400).json({ error: 'Falta información de la dirección de envío.' });
    if (!config.mercadopago.enabled) return res.status(400).json({ error: 'Configura MP_ACCESS_TOKEN en tu .env para poder cobrar.' });

    const safeItems = await validateAndPriceItems(req.body.items, req.isDistributor);
    const total = safeItems.reduce((sum, it) => sum + it.price * it.qty, 0);
    const order = await ordersStore.create({ customer: safeCustomer, shippingAddress: safeAddress, items: safeItems, notes: clean(notes, 500), total });
    try {
      const preference = await mercadopago.createPreference(order);
      await ordersStore.update(order.id, { mpPreferenceId: preference.id });
      res.status(201).json({ orderId: order.id, initPoint: preference.init_point });
    } catch (err) {
      await ordersStore.update(order.id, { paymentStatus: 'error_checkout', checkoutError: normalizeCheckoutError(err) });
      throw err;
    }
  } catch (err) {
    const detail = normalizeCheckoutError(err);
    console.error('Error en checkout:', detail);
    const status = /Carrito|Cantidad|Producto|Precio|inventario|Datos|Correo|dirección|Configura/.test(err.message) ? 400 : 500;
    res.status(status).json({ error: status === 400 ? err.message : 'No se pudo iniciar el cobro.', ...(config.isProduction ? {} : { details: detail }) });
  }
});

router.post('/payments/webhook', async (req, res) => {
  try {
    if (config.mercadopago.webhookSecret && !validateMercadoPagoSignature(req, config.mercadopago.webhookSecret)) return res.sendStatus(401);
    if (!config.mercadopago.webhookSecret && config.isProduction) return res.status(503).json({ error: 'Webhook de Mercado Pago sin secreto configurado.' });

    const paymentId = req.query['data.id'] || req.body?.data?.id;
    const topic = req.query.type || req.body?.type;
    if (topic !== 'payment' || !paymentId) return res.sendStatus(200);

    const payment = await mercadopago.getPayment(paymentId);
    const order = await ordersStore.findById(payment.external_reference);
    if (!order) return res.sendStatus(200);

    const paymentMap = {
      approved: 'pagado',
      rejected: 'rechazado',
      refunded: 'reembolsado',
      cancelled: 'cancelado',
      pending: 'pendiente',
      in_process: 'pendiente',
    };
    const nextPaymentStatus = paymentMap[payment.status];

    // Inventario CEDIA: la operación es idempotente, así que un webhook repetido
    // nunca descuenta/restaura dos veces el mismo pedido.
    if (payment.status === 'approved') {
      await inventoryService.applyPaidOrder(order);
      catalogService.clearCache();
    } else if (payment.status === 'refunded' || payment.status === 'cancelled') {
      await inventoryService.restoreOrder(order, payment.status === 'refunded' ? 'Reembolso' : 'Cancelación');
      catalogService.clearCache();
    }

    if (nextPaymentStatus && (order.paymentStatus !== nextPaymentStatus || order.mpPaymentId !== String(paymentId))) {
      const patch = { paymentStatus: nextPaymentStatus, mpPaymentId: String(paymentId) };
      if (nextPaymentStatus === 'pagado' && order.orderStatus === 'recibido') patch.orderStatus = 'preparando';
      await ordersStore.update(order.id, patch);
    }
    if (payment.status === 'approved' && order.paymentStatus !== 'pagado') {
      await fulfillmentService.fulfillOrder(order.id);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Error en webhook de Mercado Pago:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

module.exports = router;
