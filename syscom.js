// Conector Syscom -- https://developers.syscom.mx
//
// Flujo real (documentado y verificado):
//   1) POST /api/v1/oauth/token  con grant_type=client_credentials,
//      client_id y client_secret -> devuelve un token Bearer valido 1 año.
//   2) GET  /api/v1/productos  (y variantes) con header
//      Authorization: Bearer <token>
//
// Mientras SYSCOM_CLIENT_ID / SYSCOM_CLIENT_SECRET no esten en tu .env,
// este conector regresa el catalogo de muestra para que la tienda funcione.

const axios = require('axios');
const config = require('../config');
const { syscom: mockCatalog } = require('../data/mockProducts');

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const { data } = await axios.post(
    `${config.syscom.baseUrl}/oauth/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.syscom.clientId,
      client_secret: config.syscom.clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  cachedToken = data.access_token;
  // El token dura ~1 año; igual refrescamos cada 12h por seguridad.
  tokenExpiresAt = Date.now() + 12 * 60 * 60 * 1000;
  return cachedToken;
}

function normalize(item) {
  return {
    source: 'syscom',
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
  if (!config.syscom.enabled) {
    const items = query
      ? mockCatalog.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      : mockCatalog;
    return items.map(normalize);
  }

  const token = await getToken();
  // Endpoint real de busqueda de catalogo (ver seccion "Productos" en la doc).
  const { data } = await axios.get(`${config.syscom.baseUrl}/productos`, {
    headers: { Authorization: `Bearer ${token}` },
    params: query ? { busqueda: query } : {},
  });

  const items = Array.isArray(data) ? data : data.productos || [];
  return items.map((p) =>
    normalize({
      sku: p.producto_id || p.sku,
      name: p.titulo || p.nombre,
      brand: p.marca,
      category: p.categoria,
      cost: p.precios?.precio_lista ?? p.precio,
      currency: 'MXN',
      stock: p.total_existencia ?? p.existencia,
      images: p.imagenes ?? (p.img_portada ? [p.img_portada] : []),
      description: p.descripcion,
    })
  );
}

// Genera una orden real de dropshipping en Syscom: se le pide que envie
// directo al domicilio del cliente final (tipo_entrega: "domicilio").
//
// IMPORTANTE: los nombres exactos de los campos dentro de "direccion" para
// entregas a domicilio (calle, numero, colonia, cp, etc.) y los valores
// validos de metodo_pago / uso_cfdi dependen de tu cuenta y estan en la
// seccion "Carrito" de https://developers.syscom.mx/docs/carrito -- una vez
// que tengas acceso, verifica ahi los nombres exactos y ajusta el objeto
// "direccion" de abajo si no coinciden.
//
// items: [{ syscomProductId, cantidad }]
// shippingAddress: { nombre, calle, numero, colonia, ciudad, estado, cp, telefono }
async function createOrder({ items, shippingAddress, testmode = false }) {
  const token = await getToken();

  const body = {
    testmode,
    tipo_entrega: 'domicilio',
    direccion: {
      atencion_a: shippingAddress.nombre,
      calle: shippingAddress.calle,
      numero: shippingAddress.numero,
      colonia: shippingAddress.colonia,
      ciudad: shippingAddress.ciudad,
      estado: shippingAddress.estado,
      codigo_postal: shippingAddress.cp,
      telefono: shippingAddress.telefono,
    },
    metodo_pago: 'transferencia',
    tipo_pago: 'PUE',
    moneda: 'mxn',
    uso_cfdi: 'G03',
    productos: items.map((it) => ({
      id: it.syscomProductId,
      cantidad: it.cantidad,
      tipo: 'nuevo',
    })),
  };

  const { data } = await axios.post(`${config.syscom.baseUrl}/carrito/generar`, body, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return data;
}

module.exports = { fetchProducts, createOrder };
