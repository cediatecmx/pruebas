const db = require('./db');
const crypto = require('crypto');

function rowToProduct(r) {
  return {
    id: `cedia-${r.id}`, source: 'cedia', internalId: r.id, sku: r.sku,
    name: r.name, brand: r.brand || 'CEDIA', category: r.category || 'General',
    description: r.description || '', cost: Number(r.cost || 0),
    publicPrice: Number(r.public_price || 0), distributorPrice: r.distributor_price == null ? null : Number(r.distributor_price),
    price: Number(r.public_price || 0), currency: 'MXN', stock: Number(r.stock || 0),
    images: Array.isArray(r.images) ? r.images : [], active: !!r.active,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
async function list({ activeOnly=false }={}) {
  const { rows } = await db.query(`SELECT * FROM manual_products ${activeOnly ? 'WHERE active=true' : ''} ORDER BY updated_at DESC`);
  return rows.map(rowToProduct);
}
async function findById(id) {
  const internalId = String(id).replace(/^cedia-/, '');
  const { rows } = await db.query('SELECT * FROM manual_products WHERE id=$1', [internalId]);
  return rows[0] ? rowToProduct(rows[0]) : null;
}
async function create(p) {
  const id = crypto.randomUUID();
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`INSERT INTO manual_products
      (id,sku,name,brand,category,description,cost,public_price,distributor_price,stock,images,active)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id,p.sku,p.name,p.brand,p.category,p.description,p.cost,p.publicPrice,p.distributorPrice,p.stock,JSON.stringify(p.images||[]),p.active]);
    if (Number(p.stock) !== 0) {
      await client.query(`INSERT INTO inventory_movements
        (product_id,movement_type,quantity,stock_after,reason) VALUES($1,'initial',$2,$3,$4)`,
        [id, Number(p.stock), Number(p.stock), 'Inventario inicial']);
    }
    await client.query('COMMIT');
    return rowToProduct(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}
async function update(id,p) {
  const internalId = String(id).replace(/^cedia-/, '');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT stock FROM manual_products WHERE id=$1 FOR UPDATE', [internalId]);
    if (!before.rowCount) { await client.query('ROLLBACK'); return null; }
    const oldStock = Number(before.rows[0].stock || 0);
    const { rows } = await client.query(`UPDATE manual_products SET sku=$2,name=$3,brand=$4,category=$5,description=$6,cost=$7,
      public_price=$8,distributor_price=$9,stock=$10,images=$11,active=$12,updated_at=NOW() WHERE id=$1 RETURNING *`,
      [internalId,p.sku,p.name,p.brand,p.category,p.description,p.cost,p.publicPrice,p.distributorPrice,p.stock,JSON.stringify(p.images||[]),p.active]);
    const newStock = Number(p.stock || 0);
    const delta = newStock - oldStock;
    if (delta !== 0) {
      await client.query(`INSERT INTO inventory_movements
        (product_id,movement_type,quantity,stock_after,reason) VALUES($1,'manual',$2,$3,$4)`,
        [internalId, delta, newStock, 'Ajuste manual desde Admin']);
    }
    await client.query('COMMIT');
    return rowToProduct(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}
async function remove(id) {
  const internalId=String(id).replace(/^cedia-/, '');
  const { rowCount }=await db.query('DELETE FROM manual_products WHERE id=$1',[internalId]); return rowCount>0;
}
module.exports={list,findById,create,update,remove};
