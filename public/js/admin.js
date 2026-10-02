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
  const res = await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: el('#adminUsername').value, password: el('#adminPassword').value }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { el('#loginMsg').textContent = data.error || 'No se pudo iniciar sesión.'; return; }
  el('#adminPassword').value = '';
  el('#loginMsg').textContent = '';
  showAdmin(); applyRole(data.user); loadForRole(data.user);
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

api('/api/admin/session').then((res) => { if (res.ok) { showAdmin(); applyRole(data.user); loadForRole(data.user); } else showLogin(); });

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
let productUploadedImages=[];
function renderProductImagePreview(){const box=el('#productImagePreview');if(!box)return;box.innerHTML=productUploadedImages.map((u,i)=>`<div class="upload-preview__item"><img src="${esc(u)}" alt=""><button type="button" class="secondary" data-rpi="${i}">×</button></div>`).join('');box.querySelectorAll('[data-rpi]').forEach(b=>b.onclick=()=>{productUploadedImages.splice(Number(b.dataset.rpi),1);renderProductImagePreview();});}
async function uploadImage(file,kind){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Solo JPG, PNG o WebP.');if(file.size>5*1024*1024)throw new Error('Cada imagen debe pesar máximo 5 MB.');const r=await api(`/api/admin/uploads/${kind}`,{method:'POST',headers:{'Content-Type':file.type},body:await file.arrayBuffer()});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudo subir la imagen.');return d.url;}
function resetProductForm(){const f=el('#productForm');if(!f)return;f.reset();f.id.value='';f.cost.value='0';f.stock.value='0';f.active.checked=true;productUploadedImages=[];renderProductImagePreview();}
async function loadManualProducts(){const box=el('#manualProductsList');if(!box)return;const r=await api('/api/admin/products');if(!r.ok)return;const list=await r.json();box.innerHTML=list.length?list.map(p=>`<div class="admin-list-item">${p.images?.[0]?`<img src="${esc(p.images[0])}" alt="">`:'<div></div>'}<div><strong>${esc(p.name)}</strong><div class="admin-list-item__meta">${esc(p.sku)} · ${esc(p.brand)} · ${esc(p.category)} · Stock ${p.stock} · ${Number(p.publicPrice).toLocaleString('es-MX',{style:'currency',currency:'MXN'})} ${p.active?'· Activo':'· Inactivo'}</div></div><div class="admin-list-item__actions"><button data-edit-product="${esc(p.id)}">Editar</button><button class="secondary" data-delete-product="${esc(p.id)}">Eliminar</button></div></div>`).join(''):'Sin productos manuales todavía.';box.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>editProduct(list.find(x=>x.id===b.dataset.editProduct)));box.querySelectorAll('[data-delete-product]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Eliminar este producto?'))return;await api(`/api/admin/products/${encodeURIComponent(b.dataset.deleteProduct)}`,{method:'DELETE'});loadManualProducts();});}
function editProduct(p){const f=el('#productForm');f.id.value=p.id;f.sku.value=p.sku||'';f.name.value=p.name||'';f.brand.value=p.brand||'';f.category.value=p.category||'';f.description.value=p.description||'';f.cost.value=p.cost||0;f.publicPrice.value=p.publicPrice||0;f.distributorPrice.value=p.distributorPrice??'';f.stock.value=p.stock||0;productUploadedImages=[...(p.images||[])];f.images.value='';renderProductImagePreview();f.active.checked=!!p.active;f.scrollIntoView({behavior:'smooth'});}
el('#productImageFiles')?.addEventListener('change',e=>{if(productUploadedImages.length+e.target.files.length>5){el('#productMsg').textContent='Máximo 5 imágenes por producto.';e.target.value='';}});
el('#productForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,id=f.id.value,msg=el('#productMsg');try{msg.textContent='Subiendo y guardando…';const files=[...f.imageFiles.files];const uploaded=[];for(const file of files)uploaded.push(await uploadImage(file,'product'));const external=f.images.value.split('\n').map(x=>x.trim()).filter(Boolean);const images=[...productUploadedImages,...uploaded,...external].filter((x,i,a)=>a.indexOf(x)===i).slice(0,8);const body={sku:f.sku.value,name:f.name.value,brand:f.brand.value,category:f.category.value,description:f.description.value,cost:Number(f.cost.value),publicPrice:Number(f.publicPrice.value),distributorPrice:f.distributorPrice.value===''?null:Number(f.distributorPrice.value),stock:Number(f.stock.value),images,active:f.active.checked};const r=await api(id?`/api/admin/products/${encodeURIComponent(id)}`:'/api/admin/products',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));msg.textContent=r.ok?'Producto guardado.':(d.error||'No se pudo guardar.');if(r.ok){resetProductForm();loadManualProducts();loadInventoryMovements();}}catch(err){msg.textContent=err.message;}});el('#productCancel')?.addEventListener('click',resetProductForm);


async function loadInventoryMovements(){
  const box=el('#inventoryMovements'); if(!box)return;
  const r=await api('/api/admin/inventory/movements?limit=150');
  if(!r.ok){box.textContent='No se pudo cargar el historial.';return;}
  const list=await r.json();
  const labels={initial:'Inventario inicial',manual:'Ajuste manual',sale:'Venta',restock:'Devolución'};
  box.innerHTML=list.length?`<div class="inventory-table__head"><span>Fecha</span><span>Producto</span><span>Movimiento</span><span>Cantidad</span><span>Existencia</span><span>Referencia</span></div>${list.map(m=>`<div class="inventory-table__row"><span>${new Date(m.createdAt).toLocaleString('es-MX')}</span><span><strong>${esc(m.productName)}</strong><small>${esc(m.sku||'')}</small></span><span>${esc(labels[m.type]||m.type)}</span><span class="${m.quantity<0?'inventory-neg':'inventory-pos'}">${m.quantity>0?'+':''}${m.quantity}</span><span>${m.stockAfter}</span><span>${esc(m.orderId||m.reason||'—')}</span></div>`).join('')}`:'Todavía no hay movimientos de inventario.';
}
el('#inventoryRefresh')?.addEventListener('click',loadInventoryMovements);

// ---------- Banners ----------
let bannerUploadedImage='';
function dtInput(v){if(!v)return '';const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function renderBannerPreview(){const box=el('#bannerImagePreview');if(!box)return;const u=bannerUploadedImage||el('#bannerForm')?.image?.value||'';box.innerHTML=u?`<div class="upload-preview__item"><img src="${esc(u)}" alt=""></div>`:'';}
function resetBannerForm(){const f=el('#bannerForm');if(!f)return;f.reset();f.id.value='';f.sortOrder.value='0';f.active.checked=true;bannerUploadedImage='';renderBannerPreview();}
async function loadBanners(){const box=el('#bannersList');if(!box)return;const r=await api('/api/admin/banners');if(!r.ok)return;const list=await r.json();box.innerHTML=list.length?list.map(b=>`<div class="admin-list-item"><img src="${esc(b.image)}" alt=""><div><strong>${esc(b.title||'Banner sin título')}</strong><div class="admin-list-item__meta">Orden ${b.sortOrder} · ${b.active?'Activo':'Inactivo'}</div></div><div class="admin-list-item__actions"><button data-edit-banner="${esc(b.id)}">Editar</button><button class="secondary" data-delete-banner="${esc(b.id)}">Eliminar</button></div></div>`).join(''):'Sin banners todavía.';box.querySelectorAll('[data-edit-banner]').forEach(x=>x.onclick=()=>editBanner(list.find(b=>b.id===x.dataset.editBanner)));box.querySelectorAll('[data-delete-banner]').forEach(x=>x.onclick=async()=>{if(!confirm('¿Eliminar banner?'))return;await api(`/api/admin/banners/${encodeURIComponent(x.dataset.deleteBanner)}`,{method:'DELETE'});loadBanners();});}
function editBanner(b){const f=el('#bannerForm');f.id.value=b.id;f.title.value=b.title||'';f.subtitle.value=b.subtitle||'';f.image.value=b.image||'';bannerUploadedImage=b.image||'';renderBannerPreview();f.buttonText.value=b.buttonText||'';f.link.value=b.link||'';f.startsAt.value=dtInput(b.startsAt);f.endsAt.value=dtInput(b.endsAt);f.sortOrder.value=b.sortOrder||0;f.active.checked=!!b.active;f.scrollIntoView({behavior:'smooth'});}
el('#bannerForm')?.image?.addEventListener('input',renderBannerPreview);
el('#bannerForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,id=f.id.value,msg=el('#bannerMsg');try{msg.textContent='Subiendo y guardando…';let image=bannerUploadedImage||f.image.value.trim();if(f.imageFile.files[0])image=await uploadImage(f.imageFile.files[0],'banner');if(!image)throw new Error('Selecciona una imagen o proporciona una URL.');const body={title:f.title.value,subtitle:f.subtitle.value,image,buttonText:f.buttonText.value,link:f.link.value,startsAt:f.startsAt.value||null,endsAt:f.endsAt.value||null,sortOrder:Number(f.sortOrder.value||0),active:f.active.checked};const r=await api(id?`/api/admin/banners/${encodeURIComponent(id)}`:'/api/admin/banners',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));msg.textContent=r.ok?'Banner guardado.':(d.error||'No se pudo guardar.');if(r.ok){resetBannerForm();loadBanners();}}catch(err){msg.textContent=err.message;}});el('#bannerCancel')?.addEventListener('click',resetBannerForm);

// ---------- Promociones ----------
function resetPromoForm(){const f=el('#promoForm');if(!f)return;f.reset();f.id.value='';f.active.checked=true;}
async function loadPromotions(){const box=el('#promotionsList');if(!box)return;const r=await api('/api/admin/promotions');if(!r.ok)return;const list=await r.json();box.innerHTML=list.length?list.map(p=>`<div class="admin-list-item"><div></div><div><strong>${esc(p.name)}</strong><div class="admin-list-item__meta">${p.discountPercent}% · ${esc(p.targetType)} ${esc(p.targetValue||'')} · ${p.active?'Activa':'Inactiva'}${p.applyDistributor?' · Distribuidores':''}</div></div><div class="admin-list-item__actions"><button data-edit-promo="${esc(p.id)}">Editar</button><button class="secondary" data-delete-promo="${esc(p.id)}">Eliminar</button></div></div>`).join(''):'Sin promociones todavía.';box.querySelectorAll('[data-edit-promo]').forEach(x=>x.onclick=()=>editPromo(list.find(p=>p.id===x.dataset.editPromo)));box.querySelectorAll('[data-delete-promo]').forEach(x=>x.onclick=async()=>{if(!confirm('¿Eliminar promoción?'))return;await api(`/api/admin/promotions/${encodeURIComponent(x.dataset.deletePromo)}`,{method:'DELETE'});loadPromotions();});}
function editPromo(p){const f=el('#promoForm');f.id.value=p.id;f.name.value=p.name;f.targetType.value=p.targetType;f.targetValue.value=p.targetValue||'';f.discountPercent.value=p.discountPercent;f.startsAt.value=dtInput(p.startsAt);f.endsAt.value=dtInput(p.endsAt);f.applyDistributor.checked=!!p.applyDistributor;f.active.checked=!!p.active;f.scrollIntoView({behavior:'smooth'});}
el('#promoForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,id=f.id.value;const body={name:f.name.value,targetType:f.targetType.value,targetValue:f.targetValue.value,discountPercent:Number(f.discountPercent.value),startsAt:f.startsAt.value||null,endsAt:f.endsAt.value||null,applyDistributor:f.applyDistributor.checked,active:f.active.checked};const r=await api(id?`/api/admin/promotions/${encodeURIComponent(id)}`:'/api/admin/promotions',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));el('#promoMsg').textContent=r.ok?'Promoción guardada.':(d.error||'No se pudo guardar.');if(r.ok){resetPromoForm();loadPromotions();}});el('#promoCancel')?.addEventListener('click',resetPromoForm);


// ---------- Roles, usuarios y servicio técnico ----------
let currentAdminUser=null;
function applyRole(user){currentAdminUser=user||{role:'admin'};document.querySelectorAll('[data-admin-only]').forEach(x=>x.hidden=currentAdminUser.role!=='admin');}
function loadForRole(user){loadServiceOrders();if(user?.role==='admin'){loadStatus();loadSettings();loadOrders();loadDistributors('pending');loadManualProducts();loadInventoryMovements();loadBanners();loadPromotions();loadUsers();}}
async function loadUsers(){const box=el('#usersList');if(!box)return;const r=await api('/api/admin/users');if(!r.ok)return;const list=await r.json();box.innerHTML=list.map(u=>`<div class="admin-list-item"><div></div><div><strong>${esc(u.name)}</strong><div class="admin-list-item__meta">${esc(u.username)} · ${esc(u.role)} · ${u.active?'Activo':'Inactivo'}</div></div><div class="admin-list-item__actions"><button data-toggle-user="${esc(u.id)}" data-active="${u.active}">${u.active?'Desactivar':'Activar'}</button></div></div>`).join('')||'Sin usuarios adicionales.';box.querySelectorAll('[data-toggle-user]').forEach(b=>b.onclick=async()=>{await api(`/api/admin/users/${encodeURIComponent(b.dataset.toggleUser)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:b.dataset.active!=='true'})});loadUsers();});}
el('#userForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,r=await api('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name.value,username:f.username.value,password:f.password.value,role:f.role.value})});const d=await r.json().catch(()=>({}));el('#userMsg').textContent=r.ok?'Usuario creado.':(d.error||'Error');if(r.ok){f.reset();loadUsers();}});
function setupPad(canvas){if(!canvas)return;const c=canvas.getContext('2d');c.lineWidth=2;c.lineCap='round';let down=false,moved=false;const pos=e=>{const r=canvas.getBoundingClientRect(),t=e.touches?.[0]||e;return{x:(t.clientX-r.left)*(canvas.width/r.width),y:(t.clientY-r.top)*(canvas.height/r.height)}};const start=e=>{down=true;const p=pos(e);c.beginPath();c.moveTo(p.x,p.y);e.preventDefault()};const move=e=>{if(!down)return;const p=pos(e);c.lineTo(p.x,p.y);c.stroke();moved=true;e.preventDefault()};const stop=()=>down=false;canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);canvas.dataset.signed='0';canvas.addEventListener('pointermove',()=>{if(moved)canvas.dataset.signed='1'});}
setupPad(el('#receptionSignature'));document.querySelectorAll('[data-clear-signature]').forEach(b=>b.onclick=()=>{const c=el('#'+b.dataset.clearSignature);c.getContext('2d').clearRect(0,0,c.width,c.height);c.dataset.signed='0';});
el('#newServiceBtn')?.addEventListener('click',()=>{el('#serviceForm').hidden=false;el('#newServiceBtn').hidden=true;});el('#cancelServiceBtn')?.addEventListener('click',()=>{el('#serviceForm').hidden=true;el('#newServiceBtn').hidden=false;});
async function loadServiceOrders(){const box=el('#serviceOrdersList');if(!box)return;const r=await api('/api/admin/service-orders');if(!r.ok){box.innerHTML='No disponible';return;}const list=await r.json();box.innerHTML=list.map(o=>`<div class="order-card"><div class="order-card__head"><strong>${esc(o.id)}</strong><span class="order-tag">${esc(o.status)}</span></div><div><strong>${esc(o.customer?.name)}</strong> · ${esc(o.customer?.phone)}</div><div>${esc(o.equipment?.type)} · ${esc(o.equipment?.brandModel)} · ${esc(o.equipment?.serial||'Sin S/N')}</div><div class="hint">Falla: ${esc(o.intake?.reportedFault||'')}</div><div class="row"><button data-service-view="${esc(o.id)}">Gestionar</button></div><div id="svc-${esc(o.id)}"></div></div>`).join('')||'Sin órdenes de servicio.';box.querySelectorAll('[data-service-view]').forEach(b=>b.onclick=()=>openServiceOrder(b.dataset.serviceView));}
async function openServiceOrder(id){const r=await api(`/api/admin/service-orders/${encodeURIComponent(id)}`);if(!r.ok)return;const o=await r.json(),box=el('#svc-'+CSS.escape(id));const canTech=currentAdminUser.role==='admin'||currentAdminUser.role==='technician';box.innerHTML=`<div class="service-detail"><h4>Checklist de recepción</h4><p>Estado físico: ${esc(JSON.stringify(o.physicalCheck))}</p><p>Pruebas: ${esc(JSON.stringify(o.functionCheck))}</p><p>Accesorios: ${esc(JSON.stringify(o.accessories))}</p>${o.photos?.length?`<div class="service-photos">${o.photos.map(x=>`<img src="${esc(x)}">`).join('')}</div>`:''}<label>Estado<select class="svc-status">${['recibido','en_diagnostico','esperando_autorizacion','autorizado','en_reparacion','esperando_pieza','terminado','listo_entrega','entregado','cancelado'].map(x=>`<option ${o.status===x?'selected':''} value="${x}">${x.replaceAll('_',' ')}</option>`).join('')}</select></label>${canTech?`<label>Diagnóstico<textarea class="svc-diagnosis" rows="3">${esc(o.diagnosis?.text||'')}</textarea></label><label>Trabajo / presupuesto<textarea class="svc-repair" rows="3">${esc(o.repair?.text||'')}</textarea></label>`:''}<label>Entrega / observaciones<textarea class="svc-delivery" rows="2">${esc(o.delivery?.notes||'')}</textarea></label><label>Firma ${o.status==='listo_entrega'||o.status==='entregado'?'de entrega':'de autorización'}<canvas class="signature-pad svc-pad" width="700" height="150"></canvas></label><button class="svc-save">Guardar actualización</button><h5>Bitácora</h5>${(o.events||[]).map(e=>`<div class="hint">${new Date(e.createdAt).toLocaleString('es-MX')} · ${esc(e.userName)} · ${esc(e.eventType)}</div>`).join('')}</div>`;const pad=box.querySelector('.svc-pad');setupPad(pad);box.querySelector('.svc-save').onclick=async()=>{const status=box.querySelector('.svc-status').value;const body={status,delivery:{notes:box.querySelector('.svc-delivery').value},signatures:{...(o.signatures||{})}};if(canTech){body.diagnosis={text:box.querySelector('.svc-diagnosis').value};body.repair={text:box.querySelector('.svc-repair').value};}if(pad.dataset.signed==='1'){const key=(status==='listo_entrega'||status==='entregado')?'delivery':'authorization';body.signatures[key]={dataUrl:pad.toDataURL('image/png'),signedAt:new Date().toISOString(),signedBy:o.customer?.name||'Cliente'};}const rr=await api(`/api/admin/service-orders/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(rr.ok)loadServiceOrders();else alert((await rr.json()).error||'No se pudo guardar');};}
el('#serviceForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,pad=el('#receptionSignature'),msg=el('#serviceMsg');if(pad.dataset.signed!=='1'){msg.textContent='Falta la firma del cliente.';return;}try{const photos=[];for(const file of [...f.photos.files].slice(0,8))photos.push(await uploadImage(file,'service'));const body={customer:{name:f.customerName.value,phone:f.customerPhone.value,email:f.customerEmail.value},equipment:{type:f.equipmentType.value,brandModel:f.brandModel.value,serial:f.serial.value,unlockCode:f.unlockCode.value,noKey:f.noKey.checked},physicalCheck:{screen:f.screenScratches.checked,caseDamage:f.caseDamage.checked,ports:f.portsDamage.checked,humidity:f.humidity.checked,buttons:f.buttonsDamage.checked,notes:f.physicalNotes.value},functionCheck:{powersOn:f.powersOn.checked,imageOk:f.imageOk.checked,inputOk:f.inputOk.checked,camerasOk:f.camerasOk.checked,audioOk:f.audioOk.checked,wifiOk:f.wifiOk.checked},accessories:{charger:f.charger.checked,caseProtector:f.caseProtector.checked,simSd:f.simSd.checked,box:f.box.checked,other:f.otherAccessories.value},intake:{reportedFault:f.reportedFault.value,techNotes:f.techNotes.value,backup:f.backup.value,initialBudget:Number(f.initialBudget.value||0)},terms:{accepted:f.acceptTerms.checked,acceptedAt:new Date().toISOString()},photos,signatures:{reception:{dataUrl:pad.toDataURL('image/png'),signedAt:new Date().toISOString(),signedBy:f.customerName.value}}};const r=await api('/api/admin/service-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));msg.textContent=r.ok?`Orden ${d.id} creada correctamente.`:(d.error||'Error');if(r.ok){f.reset();pad.getContext('2d').clearRect(0,0,pad.width,pad.height);pad.dataset.signed='0';loadServiceOrders();}}catch(err){msg.textContent=err.message;}});
