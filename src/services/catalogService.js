const syscom = require('../connectors/syscom');
const ctonline = require('../connectors/ctonline');
const tvc = require('../connectors/tvc');
const pricing = require('./pricingService');

const PROVIDERS = { syscom, ctonline, tvc };

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

async function withFinalPrice(product) {
  return { id: `${product.source}-${product.sku}`, ...product, price: await pricing.applyMarkup(product.cost, product.source) };
}

async function getCatalog({ query, source, category } = {}) {
  const sources = source ? [source] : Object.keys(PROVIDERS);
  const results = await Promise.all(sources.map((s) => fetchFromProvider(s, query)));

  let items = await Promise.all(results.flat().map(withFinalPrice));

  if (category) {
    items = items.filter((p) => (p.category || '').toLowerCase() === category.toLowerCase());
  }

  return items;
}

async function getProductById(id) {
  const [source, ...skuParts] = id.split('-');
  const sku = skuParts.join('-');
  const items = await fetchFromProvider(source);
  const found = items.find((p) => p.sku === sku);
  return found ? await withFinalPrice(found) : null;
}

function clearCache() {
  cache.clear();
}

module.exports = { getCatalog, getProductById, clearCache };
