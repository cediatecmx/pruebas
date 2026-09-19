// Cuando un pedido se marca como pagado, este servicio lo reparte por
// proveedor y le pide a cada mayorista que envie directo al cliente final
// (dropshipping). Syscom ya esta automatizado con su API real. CT
// Internacional y TVC en Linea quedan marcados como "pendiente_manual"
// hasta que conectes sus conectores reales (ver src/connectors/ctonline.js
// y src/connectors/tvc.js) -- mientras tanto, el pedido no se pierde: se ve
// en el panel admin para que tu lo captures a mano en su portal.

const syscom = require('../connectors/syscom');
const config = require('../config');
const ordersStore = require('../data/ordersStore');

// items[i].id tiene el formato "<source>-<sku>", igual que en catalogService.
function groupItemsBySource(items) {
  const groups = {};
  for (const item of items) {
    const [source] = item.id.split('-');
    groups[source] = groups[source] || [];
    groups[source].push(item);
  }
  return groups;
}

async function fulfillOrder(orderId) {
  const order = await ordersStore.findById(orderId);
  if (!order) throw new Error(`Pedido ${orderId} no encontrado`);

  const groups = groupItemsBySource(order.items);
  const results = [];

  for (const [source, items] of Object.entries(groups)) {
    if (source === 'syscom' && config.syscom.enabled) {
      try {
        const supplierOrder = await syscom.createOrder({
          items: items.map((it) => ({
            syscomProductId: it.id.replace('syscom-', ''),
            cantidad: it.qty,
          })),
          shippingAddress: order.shippingAddress,
        });
        results.push({ source, status: 'automatico_ok', supplierOrderId: supplierOrder.pedido_id || supplierOrder.id });
      } catch (err) {
        results.push({
          source,
          status: 'automatico_error',
          error: err.response?.data || err.message,
        });
      }
    } else {
      // CT Internacional / TVC / Syscom sin credenciales todavia: se deja
      // para captura manual en el panel admin.
      results.push({ source, status: 'pendiente_manual', items: items.map((i) => i.name) });
    }
  }

  return ordersStore.update(orderId, { fulfillment: results });
}

module.exports = { fulfillOrder };
