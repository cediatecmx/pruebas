require('dotenv').config();

function has(...vars) {
  return vars.every((v) => !!process.env[v] && process.env[v].trim() !== '');
}

const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const config = {
  port: Number(process.env.PORT || 3000),
  isProduction,
  publicOrigin: (process.env.PUBLIC_ORIGIN || baseUrl).replace(/\/$/, ''),
  sessionSecret: process.env.SESSION_SECRET || (isProduction ? '' : 'dev-only-change-me'),
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  database: {
    url: process.env.DATABASE_URL || '',
    ssl: process.env.DATABASE_SSL === 'true',
  },
  defaultMarkupPercent: Number(process.env.DEFAULT_MARKUP_PERCENT || 25),
  baseUrl,
  mercadopago: {
    enabled: has('MP_ACCESS_TOKEN'),
    accessToken: process.env.MP_ACCESS_TOKEN,
    webhookSecret: process.env.MP_WEBHOOK_SECRET,
    apiBaseUrl: 'https://api.mercadopago.com',
  },
  syscom: {
    enabled: has('SYSCOM_CLIENT_ID', 'SYSCOM_CLIENT_SECRET'),
    clientId: process.env.SYSCOM_CLIENT_ID,
    clientSecret: process.env.SYSCOM_CLIENT_SECRET,
    baseUrl: 'https://developers.syscom.mx/api/v1',
  },
  ctonline: {
    enabled: has('CTONLINE_USER', 'CTONLINE_PASSWORD', 'CTONLINE_CLIENT_ID'),
    user: process.env.CTONLINE_USER,
    password: process.env.CTONLINE_PASSWORD,
    clientId: process.env.CTONLINE_CLIENT_ID,
    baseUrl: 'https://api.ctonline.mx',
  },
  tvc: {
    enabled: has('TVC_USER', 'TVC_PASSWORD', 'TVC_ACCOUNT'),
    user: process.env.TVC_USER,
    password: process.env.TVC_PASSWORD,
    account: process.env.TVC_ACCOUNT,
  },
  mercadolibre: {
    enabled: has('ML_CLIENT_ID', 'ML_CLIENT_SECRET'),
    clientId: process.env.ML_CLIENT_ID,
    clientSecret: process.env.ML_CLIENT_SECRET,
    redirectUri: process.env.ML_REDIRECT_URI || `${baseUrl}/api/mercadolibre/callback`,
    siteId: process.env.ML_SITE_ID || 'MLM',
    authBaseUrl: 'https://auth.mercadolibre.com.mx',
    apiBaseUrl: 'https://api.mercadolibre.com',
  },
};

if (isProduction) {
  const required = ['SESSION_SECRET', 'ADMIN_PASSWORD_HASH', 'PUBLIC_ORIGIN', 'BASE_URL', 'DATABASE_URL'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Faltan variables obligatorias en producción: ${missing.join(', ')}`);
}

module.exports = config;
