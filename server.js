const express = require('express');
const path = require('path');
const config = require('./src/config');
const apiRoutes = require('./src/routes/api');
const mlRoutes = require('./src/routes/mercadolibre');
const paymentsRoutes = require('./src/routes/payments');
const distributorRoutes = require('./src/routes/distributor');
const db = require('./src/data/db');
const uploads = require('./src/routes/uploads');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach((part) => { const i = part.indexOf('='); if (i > -1) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1)); });
  next();
});

app.use('/uploads', express.static(uploads.uploadDir, { fallthrough: false, maxAge: '7d' }));
app.use('/api', uploads.router);
app.use('/api', apiRoutes);
app.use('/api/mercadolibre', mlRoutes);
app.use('/api', paymentsRoutes);
app.use('/api/distributor', distributorRoutes);
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use((err, req, res, next) => {
  console.error('[server]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

async function start() {
  await db.init();
  app.listen(config.port, () => {
    console.log(`\nTienda CEDIA corriendo en ${config.baseUrl}`);
    console.log(`Panel admin: ${config.baseUrl}/admin.html`);
    console.log(`Mercado Libre: ${config.baseUrl}/api/mercadolibre/connect\n`);
  });
}

start().catch((err) => { console.error('[startup]', err); process.exit(1); });
