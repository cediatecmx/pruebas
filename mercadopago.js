// Conector Mercado Pago -- Checkout Pro (API de Preferencias)
// Documentacion verificada: https://api.mercadopago.com/checkout/preferences
//
// Flujo:
//   1) Creas una "preferencia" con los items del pedido -> te devuelve un
//      init_point (URL) al que rediriges al cliente para que pague.
//   2) Mercado Pago le cobra al cliente en su propio checkout.
//   3) Cuando el pago se aprueba, Mercado Pago llama a tu notification_url
//      (webhook) -> ahi confirmas el pago y disparas el surtido con los
//      mayoristas (ver src/services/fulfillmentService.js).

const axios = require('axios');
const config = require('../config');

async function createPreference(order) {
  const body = {
    items: order.items.map((it) => ({
      id: it.id,
      title: it.name,
      quantity: it.qty,
      currency_id: 'MXN',
      unit_price: it.price,
    })),
    payer: {
      name: order.customer.name,
      email: order.customer.email || undefined,
      phone: order.customer.phone ? { number: order.customer.phone } : undefined,
    },
    external_reference: order.id,
    notification_url: `${config.baseUrl}/api/payments/webhook`,
    back_urls: {
      success: `${config.baseUrl}/gracias.html?pedido=${order.id}`,
      failure: `${config.baseUrl}/?pago=fallido`,
      pending: `${config.baseUrl}/?pago=pendiente`,
    },
    auto_return: 'approved',
  };

  const { data } = await axios.post(`${config.mercadopago.apiBaseUrl}/checkout/preferences`, body, {
    headers: { Authorization: `Bearer ${config.mercadopago.accessToken}` },
  });
  return data; // incluye .id y .init_point
}

async function getPayment(paymentId) {
  const { data } = await axios.get(`${config.mercadopago.apiBaseUrl}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${config.mercadopago.accessToken}` },
  });
  return data;
}

module.exports = { createPreference, getPayment };
