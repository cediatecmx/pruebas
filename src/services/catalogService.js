const syscom = require('../connectors/syscom');
const ctonline = require('../connectors/ctonline');
const tvc = require('../connectors/tvc');
const pricing = require('./pricingService');

const PROVIDERS = { syscom, ctonline, tvc };

// Producto local de prueba para validar Checkout Pro con importes pequeños.
// No depende de ningún proveedor externo ni de las reglas de margen.
const TEST_PRODUCT = {
  id: 'local-PAGO-5',
  source: 'local',
  sku: 'PAGO-5',
  name: 'Producto de prueba - Pago $5',
  brand: 'CEDIA',
  category: 'Pruebas',
  cost: 5,
  price: 5,
  currency: 'MXN',
  stock: 1000,
  images: ['https://picsum.photos/seed/cedia-pago-5/600/600'],
  description: 'Producto temporal para realizar pruebas de pago de Mercado Pago por $5 MXN.'
};

// Cache muy simple en memoria (5 minutos) para no golpear las APIs de los
// mayoristas en cada request. Para produccion real usa Redis o una tabla.
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

async function fetchFromProvider(name, query) {
  const cacheKey = `${name}:${query || ''}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;

  try {
    const data = await PROVIDERS[name].fetchProducts({ query });
    cache.set(cacheKey, { data, ts: Date.now() });
    return data;
  } catch (err) {
    console.error(`[catalogService] error trayendo catalogo de ${name}:`, err.message);
    return [];
  }
}

async function withFinalPrice(product, isDistributor) {
  return { id: `${product.source}-${product.sku}`, ...product, price: await pricing.applyMarkup(product.cost, product.source, isDistributor) };
}

async function getCatalog({ query, source, category, isDistributor = false } = {}) {
  const sources = source ? [source] : Object.keys(PROVIDERS);
  const results = await Promise.all(sources.map((s) => fetchFromProvider(s, query)));

  let items = await Promise.all(results.flat().map((p) => withFinalPrice(p, isDistributor)));
  items.unshift({ ...TEST_PRODUCT });

  if (category) {
    items = items.filter((p) => (p.category || '').toLowerCase() === category.toLowerCase());
  }

  return items;
}

async function getProductById(id, isDistributor = false) {
  if (id === TEST_PRODUCT.id) return { ...TEST_PRODUCT };
  const [source, ...skuParts] = id.split('-');
  const sku = skuParts.join('-');
  const items = await fetchFromProvider(source);
  const found = items.find((p) => p.sku === sku);
  return found ? await withFinalPrice(found, isDistributor) : null;
}

function clearCache() {
  cache.clear();
}

module.exports = { getCatalog, getProductById, clearCache };
