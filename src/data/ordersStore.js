const crypto = require('crypto');
const db = require('./db');

function toJson(value, fallback = null) {
  try { return JSON.stringify(value); } catch (_) { return fallback; }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    customer: row.customer,
    shippingAddress: row.shipping_address,
    items: row.items,
    notes: row.notes || '',
    total: Number(row.total),
    paymentStatus: row.payment_status,
    orderStatus: row.order_status || 'recibido',
    carrier: row.carrier || '',
    trackingNumber: row.tracking_number || '',
    shippedAt: row.shipped_at || undefined,
    deliveredAt: row.delivered_at || undefined,
    updatedAt: row.updated_at || row.created_at,
    mpPreferenceId: row.mp_preference_id || undefined,
    mpPaymentId: row.mp_payment_id || undefined,
    checkoutError: row.checkout_error || undefined,
    fulfillment: row.fulfillment || [],
  };
}

async function create(order) {
  const id = `PED-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const record = {
    id,
    createdAt: new Date().toISOString(),
    paymentStatus: 'pendiente',
    orderStatus: 'recibido',
    carrier: '',
    trackingNumber: '',
    fulfillment: [],
    ...order,
  };
  await db.query(`INSERT INTO orders
    (id, created_at, customer, shipping_address, items, notes, total, payment_status, fulfillment)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [record.id, record.createdAt, toJson(record.customer, '{}'), toJson(record.shippingAddress, '{}'), toJson(record.items, '[]'), record.notes || '', record.total, record.paymentStatus, toJson(record.fulfillment, '[]')]);
  return record;
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM orders WHERE id=$1', [id]);
  return mapRow(rows[0]);
}

async function findByPreferenceId(preferenceId) {
  const { rows } = await db.query('SELECT * FROM orders WHERE mp_preference_id=$1', [preferenceId]);
  return mapRow(rows[0]);
}

async function update(id, patch) {
  const current = await findById(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await db.query(`UPDATE orders SET customer=$2, shipping_address=$3, items=$4, notes=$5, total=$6,
    payment_status=$7, mp_preference_id=$8, mp_payment_id=$9, checkout_error=$10, fulfillment=$11,
    order_status=$12, carrier=$13, tracking_number=$14, shipped_at=$15, delivered_at=$16, updated_at=NOW()
    WHERE id=$1`, [id, toJson(next.customer, '{}'), toJson(next.shippingAddress, '{}'), toJson(next.items, '[]'), next.notes || '', next.total,
    next.paymentStatus, next.mpPreferenceId || null, next.mpPaymentId || null, next.checkoutError ? toJson(next.checkoutError, '{}') : null, toJson(next.fulfillment || [], '[]'),
    next.orderStatus || 'recibido', next.carrier || null, next.trackingNumber || null, next.shippedAt || null, next.deliveredAt || null]);
  return next;
}

async function loadAll() {
  const { rows } = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
  return rows.map(mapRow);
}

module.exports = { loadAll, create, findById, findByPreferenceId, update };
