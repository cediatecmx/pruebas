const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const ml = require('../connectors/mercadolibre');
const catalogService = require('../services/catalogService');
const auth = require('../security/auth');

const router = express.Router();

function buildSignedState() {
  const payload = `${Date.now() + 10 * 60 * 1000}.${crypto.randomBytes(16).toString('hex')}`;
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

function verifySignedState(state) {
  if (!state || !config.sessionSecret) return false;
  const [encoded, sig] = state.split('.');
  if (!encoded || !sig) return false;
  const payload = Buffer.from(encoded, 'base64url').toString('utf8');
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(payload.split('.')[0]) > Date.now();
}

router.get('/connect', auth.requireAdmin, (req, res) => {
  if (!config.mercadolibre.enabled) return res.status(400).send('Configura ML_CLIENT_ID y ML_CLIENT_SECRET en tu .env antes de conectar Mercado Libre.');
  res.redirect(ml.buildAuthUrl(buildSignedState()));
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !verifySignedState(state)) return res.status(400).send('Solicitud OAuth inválida o expirada. Regresa al panel y vuelve a iniciar la conexión.');
    await ml.exchangeCodeForToken(code);
    res.send('Cuenta de Mercado Libre conectada correctamente. Ya puedes cerrar esta ventana.');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error conectando con Mercado Libre. Revisa la consola del servidor.');
  }
});

router.get('/status', auth.requireAdmin, async (req, res, next) => { try { res.json({ connected: await ml.isConnected() }); } catch (err) { next(err); } });

router.post('/publish/:productId', auth.requireAdmin, auth.requireSameOrigin, async (req, res) => {
  try {
    const product = await catalogService.getProductById(req.params.productId);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    const { categoryId } = req.body || {};
    if (!categoryId) {
      const suggestion = await ml.suggestCategory(product.name);
      return res.status(400).json({ error: 'Falta category_id.', suggestions: suggestion });
    }
    res.status(201).json(await ml.publishItem(product, { categoryId }));
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Error publicando en Mercado Libre', detail: err.response?.data || err.message });
  }
});

module.exports = router;
