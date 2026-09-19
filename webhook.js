const crypto = require('crypto');

function validateMercadoPagoSignature(req, secret) {
  if (!secret) return false;
  const xSignature = req.get('x-signature') || '';
  const xRequestId = req.get('x-request-id') || '';
  const dataId = req.query['data.id'];
  const parts = Object.fromEntries(xSignature.split(',').map((part) => part.split('=').map((v) => v.trim())));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifestParts = [];
  if (dataId) manifestParts.push(`id:${dataId}`);
  if (xRequestId) manifestParts.push(`request-id:${xRequestId}`);
  if (ts) manifestParts.push(`ts:${ts}`);
  const manifest = `${manifestParts.join(';')};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { validateMercadoPagoSignature };
