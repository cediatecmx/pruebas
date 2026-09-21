const db = require('../data/db');

function internalProductId(id) {
  return String(id || '').replace(/^cedia-/, '');
}

async function applyPaidOrder(order) {
  const cediaItems = (order?.items || []).filter((it) => String(it.id || '').startsWith('cedia-'));
  if (!cediaItems.length) return { applied: 0 };

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    let applied = 0;
    for (const item of cediaItems) {
      const productId = internalProductId(item.id);
      const qty = Number(item.qty || 0);
      if (!productId || !Number.isInteger(qty) || qty <= 0) continue;

      const exists = await client.query(
        `SELECT 1 FROM inventory_movements
         WHERE order_id=$1 AND product_id=$2 AND movement_type='sale' LIMIT 1`,
        [order.id, productId]
      );
      if (exists.rowCount) continue;

      const updated = await client.query(
        `UPDATE manual_products SET stock=stock-$2, updated_at=NOW()
         WHERE id=$1 AND stock >= $2 RETURNING stock`,
        [productId, qty]
      );
      if (!updated.rowCount) {
        throw new Error(`Inventario insuficiente al acreditar el pedido ${order.id} para ${item.name || item.id}.`);
      }

      await client.query(
        `INSERT INTO inventory_movements
          (product_id, order_id, movement_type, quantity, stock_after, reason)
         VALUES($1,$2,'sale',$3,$4,$5)`,
        [productId, order.id, -qty, updated.rows[0].stock, `Venta pagada ${order.id}`]
      );
      applied += 1;
    }
    await client.query('COMMIT');
    return { applied };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function restoreOrder(order, reason = 'Reembolso/cancelación') {
  const cediaItems = (order?.items || []).filter((it) => String(it.id || '').startsWith('cedia-'));
  if (!cediaItems.length) return { restored: 0 };

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    let restored = 0;
    for (const item of cediaItems) {
      const productId = internalProductId(item.id);
      const qty = Number(item.qty || 0);
      if (!productId || !Number.isInteger(qty) || qty <= 0) continue;

      const sale = await client.query(
        `SELECT 1 FROM inventory_movements
         WHERE order_id=$1 AND product_id=$2 AND movement_type='sale' LIMIT 1`,
        [order.id, productId]
      );
      if (!sale.rowCount) continue;

      const already = await client.query(
        `SELECT 1 FROM inventory_movements
         WHERE order_id=$1 AND product_id=$2 AND movement_type='restock' LIMIT 1`,
        [order.id, productId]
      );
      if (already.rowCount) continue;

      const updated = await client.query(
        `UPDATE manual_products SET stock=stock+$2, updated_at=NOW()
         WHERE id=$1 RETURNING stock`,
        [productId, qty]
      );
      if (!updated.rowCount) continue;

      await client.query(
        `INSERT INTO inventory_movements
          (product_id, order_id, movement_type, quantity, stock_after, reason)
         VALUES($1,$2,'restock',$3,$4,$5)`,
        [productId, order.id, qty, updated.rows[0].stock, `${reason} ${order.id}`]
      );
      restored += 1;
    }
    await client.query('COMMIT');
    return { restored };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listMovements({ productId, limit = 100 } = {}) {
  const params = [];
  let where = '';
  if (productId) {
    params.push(internalProductId(productId));
    where = `WHERE m.product_id=$${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
  const { rows } = await db.query(
    `SELECT m.*, p.sku, p.name
     FROM inventory_movements m
     JOIN manual_products p ON p.id=m.product_id
     ${where}
     ORDER BY m.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    productId: `cedia-${r.product_id}`,
    sku: r.sku,
    productName: r.name,
    orderId: r.order_id || '',
    type: r.movement_type,
    quantity: Number(r.quantity),
    stockAfter: Number(r.stock_after),
    reason: r.reason || '',
    createdAt: r.created_at,
  }));
}

module.exports = { applyPaidOrder, restoreOrder, listMovements };
