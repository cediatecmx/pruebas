// Conector Mercado Libre -- https://developers.mercadolibre.com.mx
//
// Flujo OAuth 2.0 (authorization_code) verificado contra la documentacion
// oficial:
//   1) Rediriges al vendedor a:
//      https://auth.mercadolibre.com.mx/authorization?response_type=code
//        &client_id=APP_ID&redirect_uri=REDIRECT_URI&state=RANDOM
//   2) Mercado Libre regresa ?code=...&state=... a tu redirect_uri
//   3) POST https://api.mercadolibre.com/oauth/token
//      body: grant_type=authorization_code, client_id, client_secret,
//            code, redirect_uri
//      -> devuelve access_token (dura 6h) y refresh_token
//   4) Con el access_token puedes publicar productos:
//      POST https://api.mercadolibre.com/items
//
// En este proyecto, el token se guarda en memoria (data/tokenStore.js) solo
// para pruebas locales. Para produccion, guardalo cifrado en tu base de
// datos y renuevalo con grant_type=refresh_token antes de que expire.

const axios = require('axios');
const config = require('../config');
const tokenStore = require('../data/tokenStore');

function buildAuthUrl(state) {
  const url = new URL(`${config.mercadolibre.authBaseUrl}/authorization`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.mercadolibre.clientId);
  url.searchParams.set('redirect_uri', config.mercadolibre.redirectUri);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

async function exchangeCodeForToken(code) {
  const { data } = await axios.post(
    `${config.mercadolibre.apiBaseUrl}/oauth/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.mercadolibre.clientId,
      client_secret: config.mercadolibre.clientSecret,
      code,
      redirect_uri: config.mercadolibre.redirectUri,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } }
  );
  await tokenStore.save(data);
  return data;
}

async function refreshToken() {
  const current = await tokenStore.get();
  if (!current?.refresh_token) throw new Error('No hay refresh_token guardado. Vuelve a autorizar la app.');

  const { data } = await axios.post(
    `${config.mercadolibre.apiBaseUrl}/oauth/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.mercadolibre.clientId,
      client_secret: config.mercadolibre.clientSecret,
      refresh_token: current.refresh_token,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  await tokenStore.save(data);
  return data;
}

async function getValidToken() {
  const current = await tokenStore.get();
  if (!current) throw new Error('Mercado Libre no esta conectado todavia. Ve a /api/mercadolibre/connect');
  if (Date.now() > current.expires_at - 60_000) {
    const refreshed = await refreshToken();
    return refreshed.access_token;
  }
  return current.access_token;
}

// Publica (o actualiza) un producto normalizado del catalogo interno como
// un item de Mercado Libre. category_id es obligatorio y se obtiene con el
// endpoint de predictor de categorias de ML; aqui se deja como parametro.
async function publishItem(product, { categoryId }) {
  const token = await getValidToken();
  const body = {
    title: product.name.slice(0, 60),
    category_id: categoryId,
    price: product.price,
    currency_id: 'MXN',
    available_quantity: product.stock,
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: 'gold_special',
    description: { plain_text: product.description || product.name },
    pictures: (product.images || []).map((url) => ({ source: url })),
  };

  const { data } = await axios.post(`${config.mercadolibre.apiBaseUrl}/items`, body, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

async function suggestCategory(query) {
  const { data } = await axios.get(
    `${config.mercadolibre.apiBaseUrl}/sites/${config.mercadolibre.siteId}/domain_discovery/search`,
    { params: { q: query } }
  );
  return data;
}

module.exports = {
  buildAuthUrl,
  exchangeCodeForToken,
  getValidToken,
  publishItem,
  suggestCategory,
  isConnected: async () => !!(await tokenStore.get()),
};
