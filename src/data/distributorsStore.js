const crypto = require('crypto');
const db = require('./db');

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessName: row.business_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    rfc: row.rfc || '',
    passwordHash: row.password_hash,
    status: row.status, // pending | approved | rejected
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || null,
  };
}

// No exponemos passwordHash hacia afuera del módulo de auth.
function toPublic(distributor) {
  if (!distributor) return null;
  const { passwordHash, ...rest } = distributor;
  return rest;
}

async function create({ businessName, contactName, email, phone, rfc, passwordHash }) {
  const id = `DIST-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  await db.query(
    `INSERT INTO distributors (id, business_name, contact_name, email, phone, rfc, password_hash, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
    [id, businessName, contactName, email.toLowerCase().trim(), phone, rfc || '', passwordHash]
  );
  return findById(id);
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM distributors WHERE id=$1', [id]);
  return mapRow(rows[0]);
}

async function findByEmail(email) {
  const { rows } = await db.query('SELECT * FROM distributors WHERE email=$1', [String(email).toLowerCase().trim()]);
  return mapRow(rows[0]);
}

async function listByStatus(status) {
  const { rows } = status
    ? await db.query('SELECT * FROM distributors WHERE status=$1 ORDER BY created_at DESC', [status])
    : await db.query('SELECT * FROM distributors ORDER BY created_at DESC');
  return rows.map(mapRow);
}

async function setStatus(id, status) {
  await db.query('UPDATE distributors SET status=$2, reviewed_at=NOW() WHERE id=$1', [id, status]);
  return findById(id);
}

module.exports = { create, findById, findByEmail, listByStatus, setStatus, toPublic };
