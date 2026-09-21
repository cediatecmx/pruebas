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
  showAdmin(); loadStatus(); loadSettings(); loadOrders(); loadDistributors('pending'); loadManualProducts(); loadBanners(); loadPromotions();
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
  form.globalMarkupPercent.value = s.globalMarkupPercent; form.syscom.value = s.markupBySource.syscom ?? ''; form.ctonline.value = s.markupBySource.ctonline ?? ''; form.tvc.value = s.markupBySource.tvc ?? ''; form.roundToNine.checked = !!s.roundToNine; form.distributorMarkupPercent.value = s.distributorMarkupPercent ?? '';
}

el('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const form = e.target;
  const payload = { globalMarkupPercent: Number(form.globalMarkupPercent.value), markupBySource: { syscom: form.syscom.value === '' ? null : Number(form.syscom.value), ctonline: form.ctonline.value === '' ? null : Number(form.ctonline.value), tvc: form.tvc.value === '' ? null : Number(form.tvc.value) }, distributorMarkupPercent: form.distributorMarkupPercent.value === '' ? null : Number(form.distributorMarkupPercent.value), roundToNine: form.roundToNine.checked };
  const res = await api('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({})); el('#settingsMsg').textContent = res.ok ? 'Guardado correctamente.' : (data.error || 'No se pudo guardar.');
});

const sourceLabels = { syscom: 'Syscom', ctonline: 'CT Internacional', tvc: 'TVC en Línea' };
const statusLabels = { automatico_ok: 'Surtido automático ✓', automatico_error: 'Error al surtir', pendiente_manual: 'Pendiente — captúralo a mano', manual_ok: 'Surtido manual ✓' };
const statusClass = { automatico_ok: 'ok', manual_ok: 'ok', automatico_error: 'error', pendiente_manual: 'manual' };

const paymentLabels = {
  pendiente: 'Pendiente de pago', pagado: 'Pagado', rechazado: 'Rechazado',
  reembolsado: 'Reembolsado', cancelado: 'Cancelado', error_checkout: 'Error de checkout'
};
const orderLabels = {
  recibido: 'Pedido recibido', preparando: 'Preparando', enviado: 'Enviado',
  entregado: 'Entregado', cancelado: 'Cancelado'
};

async function loadOrders() {
  const res = await api('/api/admin/orders'); if (!res.ok) return;
  const orders = await res.json(); const container = el('#ordersList');
  if (!orders.length) { container.innerHTML = 'Sin pedidos todavía'; return; }

  container.innerHTML = orders.map((o) => `
    <div class="order-card">
      <div class="order-card__head">
        <strong>${esc(o.id)}</strong>
        <div class="order-badges">
          <span class="pay-tag ${esc(o.paymentStatus)}">Pago: ${esc(paymentLabels[o.paymentStatus] || o.paymentStatus)}</span>
          <span class="order-tag ${esc(o.orderStatus || 'recibido')}">${esc(orderLabels[o.orderStatus || 'recibido'])}</span>
        </div>
      </div>
      <div>${esc(o.customer?.name)} · ${esc(o.customer?.phone)} · ${Number(o.total || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</div>
      <div class="order-card__address">${o.shippingAddress ? `${esc(o.shippingAddress.calle)} ${esc(o.shippingAddress.numero)}, ${esc(o.shippingAddress.colonia)}, ${esc(o.shippingAddress.ciudad)}, ${esc(o.shippingAddress.estado)}, CP ${esc(o.shippingAddress.cp)}` : 'Sin dirección'}</div>

<div class="order-products">

  <div class="order-products__title">
    Productos del pedido
  </div>

  ${(o.items || []).map((item) => {

    const qty = Number(item.qty || 1);
    const price = Number(item.price || 0);

    const subtotal = Number(
      item.subtotal ?? (price * qty)
    );

    return `
      <div class="order-product">

        <div class="order-product__image">
          ${
            item.image
              ? `<img src="${esc(item.image)}" alt="${esc(item.name || 'Producto')}">`
              : `<div class="order-product__no-image">Sin imagen</div>`
          }
        </div>

        <div class="order-product__info">

          <strong class="order-product__name">
            ${esc(item.name || 'Producto')}
          </strong>

          ${
            item.sku
              ? `<span class="order-product__sku">
                   SKU / Modelo: ${esc(item.sku)}
                 </span>`
              : ''
          }

          ${
            item.description
              ? `<p class="order-product__description">
                   ${esc(item.description)}
                 </p>`
              : ''
          }

          <div class="order-product__numbers">

            <span>
              Cantidad:
              <strong>${qty}</strong>
            </span>

            <span>
              Precio:
              <strong>
                ${price.toLocaleString('es-MX', {
                  style: 'currency',
                  currency: 'MXN'
                })}
              </strong>
            </span>

            <span>
              Subtotal:
              <strong>
                ${subtotal.toLocaleString('es-MX', {
                  style: 'currency',
                  currency: 'MXN'
                })}
              </strong>
            </span>

          </div>

        </div>

      </div>
    `;
  }).join('')}

</div>

      <div class="order-management">
        <label>Estado del pedido
          <select data-field="status" data-order="${esc(o.id)}">
            ${Object.entries(orderLabels).map(([value,label]) => `<option value="${value}" ${value === (o.orderStatus || 'recibido') ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
        <label>Paquetería
          <input data-field="carrier" data-order="${esc(o.id)}" value="${esc(o.carrier || '')}" placeholder="DHL, FedEx, Estafeta…" />
        </label>
        <label>Número de guía
          <input data-field="tracking" data-order="${esc(o.id)}" value="${esc(o.trackingNumber || '')}" placeholder="Número de rastreo" />
        </label>
        <div class="order-actions">
          <button data-action="save-status" data-order="${esc(o.id)}">Guardar seguimiento</button>
          <button class="secondary" data-action="sync-payment" data-order="${esc(o.id)}">Verificar pago</button>
        </div>
        <span class="msg" data-msg="${esc(o.id)}"></span>
      </div>

      ${(o.fulfillment || []).map((f) => `<div class="fulfillment-row"><span>${esc(sourceLabels[f.source] || f.source)}</span><span class="status ${esc(statusClass[f.status] || '')}">${esc(statusLabels[f.status] || f.status)}</span>${f.status === 'pendiente_manual' ? `<button data-action="mark-manual" data-order="${esc(o.id)}" data-source="${esc(f.source)}">Marcar surtido</button>` : ''}${f.status === 'automatico_error' ? `<button data-action="retry" data-order="${esc(o.id)}">Reintentar</button>` : ''}</div>`).join('')}
      ${o.paymentStatus === 'pagado' && !o.fulfillment?.length ? `<button data-action="retry" data-order="${esc(o.id)}" style="margin-top:8px">Surtir ahora</button>` : ''}
    </div>`).join('');

  container.querySelectorAll('button[data-action="save-status"]').forEach((btn) => btn.addEventListener('click', async () => {
    const id = btn.dataset.order;
    const orderStatus = container.querySelector(`[data-field="status"][data-order="${CSS.escape(id)}"]`).value;
    const carrier = container.querySelector(`[data-field="carrier"][data-order="${CSS.escape(id)}"]`).value;
    const trackingNumber = container.querySelector(`[data-field="tracking"][data-order="${CSS.escape(id)}"]`).value;
    const msg = container.querySelector(`[data-msg="${CSS.escape(id)}"]`);
    const r = await api(`/api/admin/orders/${encodeURIComponent(id)}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderStatus, carrier, trackingNumber }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { msg.textContent = data.error || 'No se pudo guardar.'; return; }
    msg.textContent = 'Seguimiento actualizado.'; loadOrders();
  }));

  container.querySelectorAll('button[data-action="sync-payment"]').forEach((btn) => btn.addEventListener('click', async () => {
    const id = btn.dataset.order; const msg = container.querySelector(`[data-msg="${CSS.escape(id)}"]`);
    msg.textContent = 'Consultando Mercado Pago…';
    const r = await api(`/api/admin/orders/${encodeURIComponent(id)}/sync-payment`, { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { msg.textContent = data.error || 'No se pudo verificar el pago.'; return; }
    msg.textContent = 'Pago sincronizado.'; loadOrders();
  }));

  container.querySelectorAll('button[data-action="retry"]').forEach((btn) => btn.addEventListener('click', async () => { await api(`/api/admin/orders/${encodeURIComponent(btn.dataset.order)}/fulfill`, { method: 'POST' }); loadOrders(); }));
  container.querySelectorAll('button[data-action="mark-manual"]').forEach((btn) => btn.addEventListener('click', async () => { const supplierOrderId = prompt('Número de pedido / folio que te dio el mayorista (opcional):') || ''; await api(`/api/admin/orders/${encodeURIComponent(btn.dataset.order)}/mark-manual`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: btn.dataset.source, supplierOrderId }) }); loadOrders(); }));
}

api('/api/admin/session').then((res) => { if (res.ok) { showAdmin(); loadStatus(); loadSettings(); loadOrders(); loadDistributors('pending'); loadManualProducts(); loadBanners(); loadPromotions(); } else showLogin(); });

// ---------- Solicitudes de distribuidor ----------
const distStatusLabels = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' };
let currentDistFilter = 'pending';

el('#distFilterPending').addEventListener('click', () => { setDistFilter('pending'); });
el('#distFilterAll').addEventListener('click', () => { setDistFilter(''); });

function setDistFilter(status) {
  currentDistFilter = status;
  el('#distFilterPending').classList.toggle('active', status === 'pending');
  el('#distFilterAll').classList.toggle('active', status === '');
  loadDistributors(status);
}

async function loadDistributors(status) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await api(`/api/admin/distributors${qs}`);
  if (!res.ok) return;
  const list = await res.json();
  const container = el('#distributorsList');

  if (!list.length) {
    container.innerHTML = status === 'pending' ? 'No hay solicitudes pendientes.' : 'Sin distribuidores todavía.';
    return;
  }

  container.innerHTML = list.map((d) => `
    <div class="dist-card">
      <div class="dist-card__head">
        <div>
          <strong>${esc(d.businessName)}</strong><br>
          <span style="color:var(--text-muted)">${esc(d.contactName)}</span>
        </div>
        <span class="dist-status ${esc(d.status)}">${esc(distStatusLabels[d.status] || d.status)}</span>
      </div>
      <div class="dist-card__meta">
        ${esc(d.email)} · ${esc(d.phone)}${d.rfc ? ` · RFC: ${esc(d.rfc)}` : ''}<br>
        Solicitado: ${new Date(d.createdAt).toLocaleString('es-MX')}
      </div>
      ${d.status === 'pending' ? `
        <div class="dist-card__actions">
          <button class="approve-btn" data-action="approve" data-id="${esc(d.id)}">Aprobar</button>
          <button class="reject-btn" data-action="reject" data-id="${esc(d.id)}">Rechazar</button>
        </div>
      ` : ''}
    </div>
  `).join('');

  container.querySelectorAll('button[data-action="approve"]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await api(`/api/admin/distributors/${encodeURIComponent(btn.dataset.id)}/approve`, { method: 'POST' });
      loadDistributors(currentDistFilter);
    })
  );
  container.querySelectorAll('button[data-action="reject"]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('¿Rechazar esta solicitud de distribuidor?')) return;
      await api(`/api/admin/distributors/${encodeURIComponent(btn.dataset.id)}/reject`, { method: 'POST' });
      loadDistributors(currentDistFilter);
    })
  );
}

// ---------- Productos CEDIA ----------
function resetProductForm(){const f=el('#productForm');if(!f)return;f.reset();f.id.value='';f.cost.value='0';f.stock.value='0';f.active.checked=true;}
async function loadManualProducts(){const box=el('#manualProductsList');if(!box)return;const r=await api('/api/admin/products');if(!r.ok)return;const list=await r.json();box.innerHTML=list.length?list.map(p=>`<div class="admin-list-item">${p.images?.[0]?`<img src="${esc(p.images[0])}" alt="">`:'<div></div>'}<div><strong>${esc(p.name)}</strong><div class="admin-list-item__meta">${esc(p.sku)} · ${esc(p.brand)} · ${esc(p.category)} · Stock ${p.stock} · ${Number(p.publicPrice).toLocaleString('es-MX',{style:'currency',currency:'MXN'})} ${p.active?'· Activo':'· Inactivo'}</div></div><div class="admin-list-item__actions"><button data-edit-product="${esc(p.id)}">Editar</button><button class="secondary" data-delete-product="${esc(p.id)}">Eliminar</button></div></div>`).join(''):'Sin productos manuales todavía.';box.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>editProduct(list.find(x=>x.id===b.dataset.editProduct)));box.querySelectorAll('[data-delete-product]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Eliminar este producto?'))return;await api(`/api/admin/products/${encodeURIComponent(b.dataset.deleteProduct)}`,{method:'DELETE'});loadManualProducts();});}
function editProduct(p){const f=el('#productForm');f.id.value=p.id;f.sku.value=p.sku||'';f.name.value=p.name||'';f.brand.value=p.brand||'';f.category.value=p.category||'';f.description.value=p.description||'';f.cost.value=p.cost||0;f.publicPrice.value=p.publicPrice||0;f.distributorPrice.value=p.distributorPrice??'';f.stock.value=p.stock||0;f.images.value=(p.images||[]).join('\n');f.active.checked=!!p.active;f.scrollIntoView({behavior:'smooth'});}
el('#productForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,id=f.id.value;const body={sku:f.sku.value,name:f.name.value,brand:f.brand.value,category:f.category.value,description:f.description.value,cost:Number(f.cost.value),publicPrice:Number(f.publicPrice.value),distributorPrice:f.distributorPrice.value===''?null:Number(f.distributorPrice.value),stock:Number(f.stock.value),images:f.images.value.split('\n').map(x=>x.trim()).filter(Boolean),active:f.active.checked};const r=await api(id?`/api/admin/products/${encodeURIComponent(id)}`:'/api/admin/products',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));el('#productMsg').textContent=r.ok?'Producto guardado.':(d.error||'No se pudo guardar.');if(r.ok){resetProductForm();loadManualProducts();}});el('#productCancel')?.addEventListener('click',resetProductForm);

// ---------- Banners ----------
function dtInput(v){if(!v)return '';const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function resetBannerForm(){const f=el('#bannerForm');if(!f)return;f.reset();f.id.value='';f.sortOrder.value='0';f.active.checked=true;}
async function loadBanners(){const box=el('#bannersList');if(!box)return;const r=await api('/api/admin/banners');if(!r.ok)return;const list=await r.json();box.innerHTML=list.length?list.map(b=>`<div class="admin-list-item"><img src="${esc(b.image)}" alt=""><div><strong>${esc(b.title||'Banner sin título')}</strong><div class="admin-list-item__meta">Orden ${b.sortOrder} · ${b.active?'Activo':'Inactivo'}</div></div><div class="admin-list-item__actions"><button data-edit-banner="${esc(b.id)}">Editar</button><button class="secondary" data-delete-banner="${esc(b.id)}">Eliminar</button></div></div>`).join(''):'Sin banners todavía.';box.querySelectorAll('[data-edit-banner]').forEach(x=>x.onclick=()=>editBanner(list.find(b=>b.id===x.dataset.editBanner)));box.querySelectorAll('[data-delete-banner]').forEach(x=>x.onclick=async()=>{if(!confirm('¿Eliminar banner?'))return;await api(`/api/admin/banners/${encodeURIComponent(x.dataset.deleteBanner)}`,{method:'DELETE'});loadBanners();});}
function editBanner(b){const f=el('#bannerForm');f.id.value=b.id;f.title.value=b.title||'';f.subtitle.value=b.subtitle||'';f.image.value=b.image||'';f.buttonText.value=b.buttonText||'';f.link.value=b.link||'';f.startsAt.value=dtInput(b.startsAt);f.endsAt.value=dtInput(b.endsAt);f.sortOrder.value=b.sortOrder||0;f.active.checked=!!b.active;f.scrollIntoView({behavior:'smooth'});}
el('#bannerForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,id=f.id.value;const body={title:f.title.value,subtitle:f.subtitle.value,image:f.image.value,buttonText:f.buttonText.value,link:f.link.value,startsAt:f.startsAt.value||null,endsAt:f.endsAt.value||null,sortOrder:Number(f.sortOrder.value||0),active:f.active.checked};const r=await api(id?`/api/admin/banners/${encodeURIComponent(id)}`:'/api/admin/banners',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));el('#bannerMsg').textContent=r.ok?'Banner guardado.':(d.error||'No se pudo guardar.');if(r.ok){resetBannerForm();loadBanners();}});el('#bannerCancel')?.addEventListener('click',resetBannerForm);

// ---------- Promociones ----------
function resetPromoForm(){const f=el('#promoForm');if(!f)return;f.reset();f.id.value='';f.active.checked=true;}
async function loadPromotions(){const box=el('#promotionsList');if(!box)return;const r=await api('/api/admin/promotions');if(!r.ok)return;const list=await r.json();box.innerHTML=list.length?list.map(p=>`<div class="admin-list-item"><div></div><div><strong>${esc(p.name)}</strong><div class="admin-list-item__meta">${p.discountPercent}% · ${esc(p.targetType)} ${esc(p.targetValue||'')} · ${p.active?'Activa':'Inactiva'}${p.applyDistributor?' · Distribuidores':''}</div></div><div class="admin-list-item__actions"><button data-edit-promo="${esc(p.id)}">Editar</button><button class="secondary" data-delete-promo="${esc(p.id)}">Eliminar</button></div></div>`).join(''):'Sin promociones todavía.';box.querySelectorAll('[data-edit-promo]').forEach(x=>x.onclick=()=>editPromo(list.find(p=>p.id===x.dataset.editPromo)));box.querySelectorAll('[data-delete-promo]').forEach(x=>x.onclick=async()=>{if(!confirm('¿Eliminar promoción?'))return;await api(`/api/admin/promotions/${encodeURIComponent(x.dataset.deletePromo)}`,{method:'DELETE'});loadPromotions();});}
function editPromo(p){const f=el('#promoForm');f.id.value=p.id;f.name.value=p.name;f.targetType.value=p.targetType;f.targetValue.value=p.targetValue||'';f.discountPercent.value=p.discountPercent;f.startsAt.value=dtInput(p.startsAt);f.endsAt.value=dtInput(p.endsAt);f.applyDistributor.checked=!!p.applyDistributor;f.active.checked=!!p.active;f.scrollIntoView({behavior:'smooth'});}
el('#promoForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,id=f.id.value;const body={name:f.name.value,targetType:f.targetType.value,targetValue:f.targetValue.value,discountPercent:Number(f.discountPercent.value),startsAt:f.startsAt.value||null,endsAt:f.endsAt.value||null,applyDistributor:f.applyDistributor.checked,active:f.active.checked};const r=await api(id?`/api/admin/promotions/${encodeURIComponent(id)}`:'/api/admin/promotions',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));el('#promoMsg').textContent=r.ok?'Promoción guardada.':(d.error||'No se pudo guardar.');if(r.ok){resetPromoForm();loadPromotions();}});el('#promoCancel')?.addEventListener('click',resetPromoForm);
