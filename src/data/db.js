const { Pool } = require('pg');
const config = require('../config');

if (!config.database.url) {
  console.warn('[db] DATABASE_URL no configurada. La aplicación necesitará PostgreSQL para Etapa 2.');
}

const pool = config.database.url
  ? new Pool({
      connectionString: config.database.url,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
      // Sin esto, si Railway no puede alcanzar la base de datos (URL mal
      // vinculada, servicio no linkeado, credenciales viejas, etc.) el
      // pool espera para siempre y cualquier request que dependa de la
      // base de datos (como el checkout) se queda "colgado" sin error.
      connectionTimeoutMillis: 8000, // máximo 8s para conseguir una conexión
      idleTimeoutMillis: 30000,
      max: 10,
    })
  : null;

// Si la conexión se cae después de establecida (no en el connect inicial),
// que quede en el log en vez de tumbar el proceso completo de Node.
if (pool) {
  pool.on('error', (err) => {
    console.error('[db] Error inesperado en una conexión inactiva del pool:', err.message);
  });
}

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
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_status TEXT NOT NULL DEFAULT 'recibido';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      provider TEXT PRIMARY KEY,
      encrypted_payload TEXT NOT NULL,
      expires_at BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS distributors (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      rfc TEXT,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS distributors_email_idx ON distributors(email);
    CREATE INDEX IF NOT EXISTS distributors_status_idx ON distributors(status);
    CREATE TABLE IF NOT EXISTS manual_products (
      id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, brand TEXT, category TEXT,
      description TEXT, cost NUMERIC(12,2) NOT NULL DEFAULT 0, public_price NUMERIC(12,2) NOT NULL,
      distributor_price NUMERIC(12,2), stock INTEGER NOT NULL DEFAULT 0, images JSONB NOT NULL DEFAULT '[]'::jsonb,
      active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS banners (
      id TEXT PRIMARY KEY, title TEXT, subtitle TEXT, image_url TEXT NOT NULL, button_text TEXT, link_url TEXT,
      starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, sort_order INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, target_type TEXT NOT NULL, target_value TEXT, discount_percent NUMERIC(5,2) NOT NULL,
      apply_distributor BOOLEAN NOT NULL DEFAULT false, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('[db] PostgreSQL listo.');
}

async function close() { if (pool) await pool.end(); }
module.exports = { pool, query, init, close };
