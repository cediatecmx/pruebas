// Conector CT Internacional -- CT Connect / CT Integra
// Documentacion tecnica (requiere alta de partner): https://api.ctonline.mx/
//
// CT Internacional publica su documentacion de desarrolladores solo a
// distribuidores dados de alta. El patron general de este tipo de APIs B2B
// mayoristas en Mexico es: login con usuario/password de tu cuenta de
// partner -> token -> endpoints de catalogo/existencias/precio.
//
// Deja las credenciales en tu .env (CTONLINE_USER, CTONLINE_PASSWORD,
// CTONLINE_CLIENT_ID) y ajusta las rutas de abajo (marcadas con TODO)
// una vez que tu ejecutivo de cuenta te comparta el manual de CT Connect.
// Mientras tanto, se usa catalogo de muestra.

const axios = require('axios');
const config = require('../config');
const { ctonline: mockCatalog } = require('../data/mockProducts');

function normalize(item) {
  return {
    source: 'ctonline',
    sku: item.sku,
    name: item.name,
    brand: item.brand,
    category: item.category,
    cost: Number(item.cost),
    currency: item.currency || 'MXN',
    stock: Number(item.stock || 0),
    images: item.images || [],
    description: item.description || '',
  };
}

async function fetchProducts({ query } = {}) {
  if (!config.ctonline.enabled) {
    const items = query
      ? mockCatalog.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      : mockCatalog;
    return items.map(normalize);
  }

  // TODO: sustituir por las rutas reales que te de CT Internacional.
  // Ejemplo tipico de este tipo de integraciones B2B:
  //
  // const { data: auth } = await axios.post(`${config.ctonline.baseUrl}/auth/login`, {
  //   usuario: config.ctonline.user,
  //   password: config.ctonline.password,
  //   cliente_id: config.ctonline.clientId,
  // });
  // const { data } = await axios.get(`${config.ctonline.baseUrl}/catalogo/productos`, {
  //   headers: { Authorization: `Bearer ${auth.token}` },
  //   params: query ? { q: query } : {},
  // });
  // return data.items.map((p) => normalize({ ... }));

  throw new Error(
    'Conector CT Internacional: agrega las rutas reales de CT Connect en src/connectors/ctonline.js'
  );
}

module.exports = { fetchProducts };
