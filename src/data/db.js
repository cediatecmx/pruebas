const { Pool } = require('pg');
const config = require('../config');

if (!config.database.url) {
  console.warn('[db] DATABASE_URL no configurada. La aplicación necesitará PostgreSQL para Etapa 2.');
}

const pool = config.database.url ? new Pool({ connectionString: config.database.url, ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined }) : null;

async function query(text, params = []) {
  if (!pool) throw new Error('DATABASE_URL no está configurada.');
  return pool.query(text, params);
}

async function init() {
  if (!pool) return;
  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      customer JSONB NOT NULL,
      shipping_address JSONB NOT NULL,
      items JSONB NOT NULL,
      notes TEXT,
      total NUMERIC(12,2) NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pendiente',
      mp_preference_id TEXT,
      mp_payment_id TEXT,
      checkout_error JSONB,
      fulfillment JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS orders_mp_preference_idx ON orders(mp_preference_id);
    CREATE INDEX IF NOT EXISTS orders_mp_payment_idx ON orders(mp_payment_id);
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      provider TEXT PRIMARY KEY,
      encrypted_payload TEXT NOT NULL,
      expires_at BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('[db] PostgreSQL listo.');
}

async function close() { if (pool) await pool.end(); }
module.exports = { pool, query, init, close };
