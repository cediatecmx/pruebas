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

let ordersCache=[];
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
        <label>Fotos de seguimiento
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-field="tracking-photos" data-order="${esc(o.id)}" />
          <small class="hint">Puedes agregar fotos del empaque, preparación, guía o entrega.</small>
        </label>
        ${(o.trackingPhotos||[]).length?`<div class="tracking-photo-grid">${(o.trackingPhotos||[]).map(x=>`<a href="${esc(x)}" target="_blank" rel="noopener"><img src="${esc(x)}" alt="Seguimiento del pedido"></a>`).join('')}</div>`:''}
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
    const photoInput = container.querySelector(`[data-field="tracking-photos"][data-order="${CSS.escape(id)}"]`);
    const currentOrder = ordersCache.find(x=>x.id===id);
    const trackingPhotos = [...(currentOrder?.trackingPhotos||[])];
    const msg = container.querySelector(`[data-msg="${CSS.escape(id)}"]`);
    try {
      for (const file of [...(photoInput?.files||[])].slice(0,6)) trackingPhotos.push(await uploadImage(file,'service'));
    } catch (e) { msg.textContent=e.message; return; }
    const r = await api(`/api/admin/orders/${encodeURIComponent(id)}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderStatus, carrier, trackingNumber, trackingPhotos:trackingPhotos.slice(0,12) }) });
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

api('/api/admin/session').then(async (res) => {
  if (!res.ok) {
    showLogin();
    return;
  }

  const data = await res.json().catch(() => ({}));
  showAdmin();
  applyRole(data.user);
  loadForRole(data.user);
}).catch((err) => {
  console.error('No se pudo comprobar la sesión administrativa:', err);
  showLogin();
});

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
const SERVICE_STATUS_LABELS={recibido:'Recibido',en_diagnostico:'En diagnóstico',esperando_autorizacion:'Esperando autorización',autorizado:'Autorizado',en_reparacion:'En reparación',esperando_pieza:'Esperando pieza',terminado:'Terminado',listo_entrega:'Listo para entrega',entregado:'Entregado',cancelado:'Cancelado'};
function checklistItem(label,value,mode='condition'){
  const yes=!!value;
  const cls=mode==='ok'?(yes?'check-good':'check-bad'):(yes?'check-warn':'check-neutral');
  const mark=mode==='ok'?(yes?'✓':'✕'):(yes?'⚠':'✓');
  const text=mode==='ok'?(yes?'Correcto':'No / con falla'):(yes?'Con observación':'Sin observación');
  return `<div class="svc-check-item ${cls}"><span class="svc-check-icon">${mark}</span><div><strong>${esc(label)}</strong><small>${text}</small></div></div>`;
}
function signatureCard(label,sig){
  if(!sig)return `<div class="svc-sign-card pending"><div><strong>${esc(label)}</strong><small>Pendiente de firma</small></div><span class="svc-sign-status">Pendiente</span></div>`;
  const method=sig.method==='remote'?'Firma remota':'Firma presencial';
  const date=sig.signedAt?new Date(sig.signedAt).toLocaleString('es-MX'):'Fecha no registrada';
  return `<div class="svc-sign-card signed"><div class="svc-sign-meta"><strong>${esc(label)}</strong><small>${esc(sig.signedBy||'Cliente')} · ${method}<br>${esc(date)}</small></div><button type="button" class="secondary svc-view-sign" data-signature="${esc(sig.dataUrl||'')}">Ver firma</button><span class="svc-sign-status">Firmado ✓</span></div>`;
}
function renderServiceChecklist(o){
  const p=o.physicalCheck||{},f=o.functionCheck||{},a=o.accessories||{};
  return `<div class="svc-checklist-grid">
    <section class="svc-check-group"><h5>Estado físico</h5><div class="svc-check-items">${checklistItem('Pantalla: rayas/manchas/despegada',p.screen)}${checklistItem('Carcasa/marco: golpes o rayones',p.caseDamage)}${checklistItem('Puertos con daño o juego',p.ports)}${checklistItem('Humedad detectada',p.humidity)}${checklistItem('Botones con anomalía',p.buttons)}</div>${p.notes?`<div class="svc-note"><strong>Observaciones:</strong> ${esc(p.notes)}</div>`:''}</section>
    <section class="svc-check-group"><h5>Prueba de funcionamiento</h5><div class="svc-check-items">${checklistItem('Encendido / carga sistema',f.powersOn,'ok')}${checklistItem('Imagen limpia',f.imageOk,'ok')}${checklistItem('Táctil / teclado',f.inputOk,'ok')}${checklistItem('Cámaras',f.camerasOk,'ok')}${checklistItem('Audio',f.audioOk,'ok')}${checklistItem('Wi-Fi / conectividad',f.wifiOk,'ok')}</div></section>
    <section class="svc-check-group"><h5>Accesorios recibidos</h5><div class="svc-accessories">${a.charger?'<span>✓ Cargador</span>':''}${a.caseProtector?'<span>✓ Funda / protector</span>':''}${a.simSd?'<span>✓ SIM / Micro SD</span>':''}${a.box?'<span>✓ Caja original</span>':''}${a.other?`<span>✓ ${esc(a.other)}</span>`:''}${!a.charger&&!a.caseProtector&&!a.simSd&&!a.box&&!a.other?'<span class="muted">Sin accesorios registrados</span>':''}</div></section>
  </div>`;
}
async function openServiceOrder(id){
  const r=await api(`/api/admin/service-orders/${encodeURIComponent(id)}`);if(!r.ok)return;
  const o=await r.json(),box=el('#svc-'+CSS.escape(id));
  const canTech=currentAdminUser.role==='admin'||currentAdminUser.role==='technician';
  const sig=o.signatures||{};
  box.innerHTML=`<div class="service-detail">
    <div class="svc-detail-heading"><div><h4>Orden ${esc(o.id)}</h4><span class="svc-status-badge">${esc(SERVICE_STATUS_LABELS[o.status]||o.status)}</span></div><div class="svc-pdf-actions"><a class="button-like secondary" href="/api/admin/service-orders/${encodeURIComponent(o.id)}/pdf" target="_blank" rel="noopener">Visualizar PDF</a><a class="button-like secondary" href="/api/admin/service-orders/${encodeURIComponent(o.id)}/pdf?download=1">Descargar PDF</a><small>Actualizada ${o.updatedAt?new Date(o.updatedAt).toLocaleString('es-MX'):'—'}</small></div></div>
    <h4>Checklist de recepción</h4>${renderServiceChecklist(o)}
    ${o.photos?.length?`<section class="svc-section-card"><h5>Fotografías del equipo</h5><div class="service-photos">${o.photos.map(x=>`<a href="${esc(x)}" target="_blank" rel="noopener"><img src="${esc(x)}" alt="Equipo recibido"></a>`).join('')}</div></section>`:''}
    <section class="svc-section-card"><h5>Firmas y conformidad</h5><div class="svc-signatures">${signatureCard('Recepción / aceptación',sig.reception)}${signatureCard('Autorización',sig.authorization)}${signatureCard('Entrega',sig.delivery)}</div></section>
    <section class="svc-section-card svc-workflow"><h5>Seguimiento técnico</h5><label>Estado<select class="svc-status">${Object.entries(SERVICE_STATUS_LABELS).map(([x,label])=>`<option ${o.status===x?'selected':''} value="${x}">${label}</option>`).join('')}</select></label>${canTech?`<label>Diagnóstico<textarea class="svc-diagnosis" rows="3">${esc(o.diagnosis?.text||'')}</textarea></label><label>Trabajo / presupuesto<textarea class="svc-repair" rows="3">${esc(o.repair?.text||'')}</textarea></label>`:''}<label>Entrega / observaciones<textarea class="svc-delivery" rows="2">${esc(o.delivery?.notes||'')}</textarea></label><label>Nueva firma ${o.status==='listo_entrega'||o.status==='entregado'?'de entrega':'de autorización'}<canvas class="signature-pad svc-pad" width="700" height="150"></canvas></label><button class="svc-save">Guardar actualización</button></section>
    <div class="remote-sign-box"><h5>Firma a distancia</h5><p class="hint">Genera un enlace privado para que el cliente revise esta orden y firme desde su teléfono.</p><div class="row"><button type="button" class="secondary svc-link" data-type="reception">Link recepción</button><button type="button" class="secondary svc-link" data-type="authorization">Link autorización</button><button type="button" class="secondary svc-link" data-type="delivery">Link entrega</button></div><div class="svc-link-result"></div></div>
    <section class="svc-section-card"><h5>Bitácora</h5><div class="svc-timeline">${(o.events||[]).map(e=>`<div><span></span><p><strong>${esc(e.userName)}</strong> · ${esc(String(e.eventType||'').replaceAll('_',' '))}<small>${new Date(e.createdAt).toLocaleString('es-MX')}</small></p></div>`).join('')||'<p class="hint">Sin movimientos registrados.</p>'}</div></section>
  </div>`;
  const pad=box.querySelector('.svc-pad');setupPad(pad);
  box.querySelectorAll('.svc-view-sign').forEach(btn=>btn.onclick=()=>{
    const src=btn.dataset.signature;
    if(!src){ alert('No hay una firma registrada.'); return; }
    const modal=document.createElement('div');
    modal.className='svc-sign-modal';
    modal.innerHTML=`<div class="svc-sign-modal__dialog" role="dialog" aria-modal="true" aria-label="Firma ${esc(o.id)}">
      <div class="svc-sign-modal__head"><div><strong>Firma del cliente</strong><small>Orden ${esc(o.id)}</small></div><button type="button" class="svc-sign-modal__close" aria-label="Cerrar">×</button></div>
      <div class="svc-sign-modal__image"><img src="${src}" alt="Firma del cliente de la orden ${esc(o.id)}"></div>
      <div class="svc-sign-modal__actions"><button type="button" class="secondary svc-sign-modal__done">Cerrar</button></div>
    </div>`;
    document.body.appendChild(modal);
    const close=()=>modal.remove();
    modal.querySelector('.svc-sign-modal__close').onclick=close;
    modal.querySelector('.svc-sign-modal__done').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
  });
  box.querySelectorAll('.svc-link').forEach(btn=>btn.onclick=async()=>{const result=box.querySelector('.svc-link-result');result.innerHTML='Generando enlace…';const rr=await api(`/api/admin/service-orders/${encodeURIComponent(id)}/signature-link`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:btn.dataset.type})});const d=await rr.json().catch(()=>({}));if(!rr.ok){result.textContent=d.error||'No se pudo generar el enlace.';return;}result.innerHTML=`<div class="signature-link-card"><input readonly value="${esc(d.url)}"><button type="button" class="copy-sign-link">Copiar</button><a class="button-like secondary" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Hola, te compartimos la orden '+o.id+' para que la revises y, si estás conforme, la firmes: '+d.url)}">WhatsApp</a><small>Vence: ${new Date(d.expiresAt).toLocaleString('es-MX')}</small></div>`;result.querySelector('.copy-sign-link').onclick=async()=>{await navigator.clipboard.writeText(d.url);result.querySelector('.copy-sign-link').textContent='Copiado ✓';};});
  box.querySelector('.svc-save').onclick=async()=>{const status=box.querySelector('.svc-status').value;const body={status,delivery:{notes:box.querySelector('.svc-delivery').value},signatures:{...(o.signatures||{})}};if(canTech){body.diagnosis={text:box.querySelector('.svc-diagnosis').value};body.repair={text:box.querySelector('.svc-repair').value};}if(pad.dataset.signed==='1'){const key=(status==='listo_entrega'||status==='entregado')?'delivery':'authorization';body.signatures[key]={dataUrl:pad.toDataURL('image/png'),signedAt:new Date().toISOString(),signedBy:o.customer?.name||'Cliente',method:'presential'};}const rr=await api(`/api/admin/service-orders/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(rr.ok)loadServiceOrders();else alert((await rr.json()).error||'No se pudo guardar');};
}
el('#serviceForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,pad=el('#receptionSignature'),msg=el('#serviceMsg');try{const photos=[];for(const file of [...f.photos.files].slice(0,8))photos.push(await uploadImage(file,'service'));const body={customer:{name:f.customerName.value,phone:f.customerPhone.value,email:f.customerEmail.value},equipment:{type:f.equipmentType.value,brandModel:f.brandModel.value,serial:f.serial.value,unlockCode:f.unlockCode.value,noKey:f.noKey.checked},physicalCheck:{screen:f.screenScratches.checked,caseDamage:f.caseDamage.checked,ports:f.portsDamage.checked,humidity:f.humidity.checked,buttons:f.buttonsDamage.checked,notes:f.physicalNotes.value},functionCheck:{powersOn:f.powersOn.checked,imageOk:f.imageOk.checked,inputOk:f.inputOk.checked,camerasOk:f.camerasOk.checked,audioOk:f.audioOk.checked,wifiOk:f.wifiOk.checked},accessories:{charger:f.charger.checked,caseProtector:f.caseProtector.checked,simSd:f.simSd.checked,box:f.box.checked,other:f.otherAccessories.value},intake:{reportedFault:f.reportedFault.value,techNotes:f.techNotes.value,backup:f.backup.value,initialBudget:Number(f.initialBudget.value||0)},terms:{accepted:f.acceptTerms.checked,acceptedAt:new Date().toISOString()},photos,signatures:pad.dataset.signed==='1'?{reception:{dataUrl:pad.toDataURL('image/png'),signedAt:new Date().toISOString(),signedBy:f.customerName.value,method:'presential'}}:{}};const r=await api('/api/admin/service-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));msg.textContent=r.ok?`Orden ${d.id} creada correctamente.`:(d.error||'Error');if(r.ok){f.reset();pad.getContext('2d').clearRect(0,0,pad.width,pad.height);pad.dataset.signed='0';loadServiceOrders();}}catch(err){msg.textContent=err.message;}});
