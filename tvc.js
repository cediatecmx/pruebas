// Conector TVC en Linea
// TVC ofrece un webservice de catalogo/existencias para distribuidores dados
// de alta (lo anuncian en https://tvc.mx). El acceso y el manual tecnico se
// solicitan directamente a tu ejecutivo de cuenta TVC.
//
// Deja tus credenciales en el .env (TVC_USER, TVC_PASSWORD, TVC_ACCOUNT) y
// completa las rutas reales abajo (marcadas con TODO) cuando TVC te
// comparta el manual. Mientras tanto, se usa catalogo de muestra.

const config = require('../config');
const { tvc: mockCatalog } = require('../data/mockProducts');

function normalize(item) {
  return {
    source: 'tvc',
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
  if (!config.tvc.enabled) {
    const items = query
      ? mockCatalog.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      : mockCatalog;
    return items.map(normalize);
  }

  // TODO: implementar aqui la llamada real al webservice de TVC en cuanto
  // tengas el manual (usuario/password/cuenta ya estan en config.tvc).
  throw new Error(
    'Conector TVC: agrega la llamada real al webservice en src/connectors/tvc.js'
  );
}

module.exports = { fetchProducts };
