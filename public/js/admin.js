const el = (sel) => document.querySelector(sel);

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  if (res.status === 401) showLogin();
  return res;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function showLogin() { el('#loginCard').hidden = false; el('#adminContent').hidden = true; }
function showAdmin() { el('#loginCard').hidden = true; el('#adminContent').hidden = false; }

el('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: el('#adminPassword').value }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { el('#loginMsg').textContent = data.error || 'No se pudo iniciar sesión.'; return; }
  el('#adminPassword').value = '';
  el('#loginMsg').textContent = '';
  showAdmin(); loadStatus(); loadSettings(); loadOrders();
});

el('#logoutBtn').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }); showLogin(); });

async function loadStatus() {
  const res = await api('/api/status'); if (!res.ok) return;
  const data = await res.json();
  const labels = { syscom: 'Syscom', ctonline: 'CT Internacional', tvc: 'TVC en Línea', mercadolibre: 'Mercado Libre' };
  el('#statusList').innerHTML = Object.entries(data).map(([key, value]) => `<div class="status-item"><span>${esc(labels[key] || key)}</span><span class="tag ${String(value).includes('conectado') || String(value).includes('configurada') ? 'on' : ''}">${esc(value)}</span></div>`).join('');
}

async function loadSettings() {
  const res = await api('/api/admin/settings'); if (!res.ok) return;
  const s = await res.json(); const form = el('#settingsForm');
  form.globalMarkupPercent.value = s.globalMarkupPercent; form.syscom.value = s.markupBySource.syscom ?? ''; form.ctonline.value = s.markupBySource.ctonline ?? ''; form.tvc.value = s.markupBySource.tvc ?? ''; form.roundToNine.checked = !!s.roundToNine;
}

el('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const form = e.target;
  const payload = { globalMarkupPercent: Number(form.globalMarkupPercent.value), markupBySource: { syscom: form.syscom.value === '' ? null : Number(form.syscom.value), ctonline: form.ctonline.value === '' ? null : Number(form.ctonline.value), tvc: form.tvc.value === '' ? null : Number(form.tvc.value) }, roundToNine: form.roundToNine.checked };
  const res = await api('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({})); el('#settingsMsg').textContent = res.ok ? 'Guardado correctamente.' : (data.error || 'No se pudo guardar.');
});

const sourceLabels = { syscom: 'Syscom', ctonline: 'CT Internacional', tvc: 'TVC en Línea' };
const statusLabels = { automatico_ok: 'Surtido automático ✓', automatico_error: 'Error al surtir', pendiente_manual: 'Pendiente — captúralo a mano', manual_ok: 'Surtido manual ✓' };
const statusClass = { automatico_ok: 'ok', manual_ok: 'ok', automatico_error: 'error', pendiente_manual: 'manual' };

async function loadOrders() {
  const res = await api('/api/admin/orders'); if (!res.ok) return;
  const orders = await res.json(); const container = el('#ordersList');
  if (!orders.length) { container.innerHTML = 'Sin pedidos todavía'; return; }
  container.innerHTML = orders.slice().reverse().map((o) => `<div class="order-card"><div class="order-card__head"><strong>${esc(o.id)}</strong><span class="pay-tag ${esc(o.paymentStatus)}">${esc(o.paymentStatus)}</span></div><div>${esc(o.customer?.name)} · ${esc(o.customer?.phone)} · ${Number(o.total || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</div><div class="order-card__address">${o.shippingAddress ? `${esc(o.shippingAddress.calle)} ${esc(o.shippingAddress.numero)}, ${esc(o.shippingAddress.colonia)}, ${esc(o.shippingAddress.ciudad)}, ${esc(o.shippingAddress.estado)}, CP ${esc(o.shippingAddress.cp)}` : 'Sin dirección'}</div>${(o.fulfillment || []).map((f) => `<div class="fulfillment-row"><span>${esc(sourceLabels[f.source] || f.source)}</span><span class="status ${esc(statusClass[f.status] || '')}">${esc(statusLabels[f.status] || f.status)}</span>${f.status === 'pendiente_manual' ? `<button data-action="mark-manual" data-order="${esc(o.id)}" data-source="${esc(f.source)}">Marcar surtido</button>` : ''}${f.status === 'automatico_error' ? `<button data-action="retry" data-order="${esc(o.id)}">Reintentar</button>` : ''}</div>`).join('')}${o.paymentStatus === 'pagado' && !o.fulfillment?.length ? `<button data-action="retry" data-order="${esc(o.id)}" style="margin-top:8px">Surtir ahora</button>` : ''}</div>`).join('');
  container.querySelectorAll('button[data-action="retry"]').forEach((btn) => btn.addEventListener('click', async () => { await api(`/api/admin/orders/${encodeURIComponent(btn.dataset.order)}/fulfill`, { method: 'POST' }); loadOrders(); }));
  container.querySelectorAll('button[data-action="mark-manual"]').forEach((btn) => btn.addEventListener('click', async () => { const supplierOrderId = prompt('Número de pedido / folio que te dio el mayorista (opcional):') || ''; await api(`/api/admin/orders/${encodeURIComponent(btn.dataset.order)}/mark-manual`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: btn.dataset.source, supplierOrderId }) }); loadOrders(); }));
}

api('/api/admin/session').then((res) => { if (res.ok) { showAdmin(); loadStatus(); loadSettings(); loadOrders(); } else showLogin(); });
