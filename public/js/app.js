const state = {
  products: [],
  query: '',
  source: '',
  category: '',
  cart: JSON.parse(localStorage.getItem('cedia-cart') || '[]'),
};

const el = (sel) => document.querySelector(sel);

function money(n) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

let promoIndex = 0;
let promoTimer = null;
async function loadPromoBanners() {
  try {
    const res = await fetch('/api/marketing/banners');
    if (!res.ok) return;
    const banners = await res.json();
    const slider = el('#promoSlider');
    if (!slider || !banners.length) return;
    slider.hidden = false;
    el('#promoSlides').innerHTML = banners.map((b,i)=>`<article class="promo-slide ${i===0?'active':''}"><img src="${b.image}" alt="${b.title||'Promoción Grupo CEDIA'}"><div class="promo-slide__overlay">${b.title?`<h2>${b.title}</h2>`:''}${b.subtitle?`<p>${b.subtitle}</p>`:''}${b.buttonText&&b.link?`<a href="${b.link}">${b.buttonText}</a>`:''}</div></article>`).join('');
    el('#promoDots').innerHTML=banners.map((_,i)=>`<button class="promo-dot ${i===0?'active':''}" data-slide="${i}" aria-label="Banner ${i+1}"></button>`).join('');
    const show=(n)=>{const slides=[...document.querySelectorAll('.promo-slide')],dots=[...document.querySelectorAll('.promo-dot')];if(!slides.length)return;promoIndex=(n+slides.length)%slides.length;slides.forEach((x,i)=>x.classList.toggle('active',i===promoIndex));dots.forEach((x,i)=>x.classList.toggle('active',i===promoIndex));};
    slider.querySelector('.promo-next').onclick=()=>show(promoIndex+1); slider.querySelector('.promo-prev').onclick=()=>show(promoIndex-1);
    slider.querySelectorAll('.promo-dot').forEach(x=>x.onclick=()=>show(Number(x.dataset.slide)));
    const start=()=>{clearInterval(promoTimer);if(banners.length>1)promoTimer=setInterval(()=>show(promoIndex+1),6000);}; start();
    slider.addEventListener('mouseenter',()=>clearInterval(promoTimer)); slider.addEventListener('mouseleave',start);
  } catch (e) { console.warn('No se pudieron cargar banners:', e.message); }
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.source) params.set('source', state.source);
  if (state.category) params.set('category', state.category);

  el('#resultsCount').textContent = 'Cargando catálogo…';
  const res = await fetch(`/api/products?${params}`);
  const data = await res.json();
  state.products = data.products;
  renderCategoryFilters();
  renderProducts();
}

function renderCategoryFilters() {
  const categories = [...new Set(state.products.map((p) => p.category).filter(Boolean))].sort();
  const container = el('#categoryList');
  const current = state.category;
  container.innerHTML = `<label><input type="radio" name="category" value="" ${!current ? 'checked' : ''}> Todas</label>` +
    categories.map(
      (c) => `<label><input type="radio" name="category" value="${c}" ${current === c ? 'checked' : ''}> ${c}</label>`
    ).join('');
  container.querySelectorAll('input').forEach((input) =>
    input.addEventListener('change', (e) => {
      state.category = e.target.value;
      loadProducts();
    })
  );
}

function renderProducts() {
  const grid = el('#productGrid');
  const distNote = state.distributor?.authenticated ? ' · viendo precios de distribuidor' : '';
  el('#resultsCount').textContent = `${state.products.length} producto(s) encontrados${distNote}`;

  if (!state.products.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">No encontramos productos con ese filtro.</p>';
    return;
  }

  grid.innerHTML = state.products.map((p) => `
    <div class="product-card" data-source="${p.source || ''}">
      <div class="product-card__media" data-product-id="${p.id}">
        <img src="${p.images?.[0] || ''}" alt="${p.name || 'Producto'}" loading="lazy" />
      </div>
      <span class="brand-tag">${p.brand || 'Grupo CEDIA'}</span>
      <h3 data-product-id="${p.id}">${p.name || 'Producto'}</h3>
      ${p.description ? `<p class="product-card__desc">${p.description}</p>` : ''}
      <div class="price-row">
        ${p.promotion ? `<span class="discount-badge">-${p.promotion.discountPercent}%</span><span class="old-price">${money(Number(p.originalPrice)||0)}</span>` : ''}<span class="price">${money(Number(p.price) || 0)}</span>
        <span class="stock">${p.stock > 0 ? `${p.stock} disp.` : 'Agotado'}</span>
      </div>
      <button class="add-cart-btn" ${p.stock > 0 ? '' : 'disabled'} data-id="${p.id}">
        Agregar al carrito
      </button>
    </div>
  `).join('');

  grid.querySelectorAll('.add-cart-btn').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.dataset.id));
  });

  grid.querySelectorAll('[data-product-id]').forEach((item) => {
    item.addEventListener('click', () => openProduct(item.dataset.productId));
  });
}

function openProduct(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;

  const modal = el('#productModal');
  const content = el('#productModalContent');
  if (!modal || !content) return;

  const description = product.description?.trim() ||
    'Consulta con Grupo CEDIA para conocer más información sobre este producto.';

  content.innerHTML = `
    <div class="product-detail">
      <div class="product-detail__image">
        <img src="${product.images?.[0] || ''}" alt="${product.name || 'Producto'}" />
      </div>
      <div class="product-detail__info">
        <span class="brand-tag">${product.brand || 'Grupo CEDIA'}</span>
        <h2>${product.name || 'Producto'}</h2>
        <div class="product-detail__description">
          <h4>Descripción</h4>
          <p class="product-detail__desc">${description}</p>
        </div>
        <div class="price-row product-detail__price-row">
          ${product.promotion ? `<span class="discount-badge">-${product.promotion.discountPercent}%</span><span class="old-price">${money(Number(product.originalPrice)||0)}</span>` : ''}<span class="price">${money(Number(product.price) || 0)}</span>
          <span class="stock">${product.stock > 0 ? `${product.stock} disponibles` : 'Agotado'}</span>
        </div>
        <button id="productModalAdd" ${product.stock > 0 ? '' : 'disabled'}>
          ${product.stock > 0 ? 'Agregar al carrito' : 'Producto agotado'}
        </button>
      </div>
    </div>
  `;

  modal.classList.add('open');

  const addButton = el('#productModalAdd');
  if (addButton && product.stock > 0) {
    addButton.addEventListener('click', () => {
      addToCart(product.id);
      closeProduct();
    });
  }
}

function closeProduct() {
  const modal = el('#productModal');
  if (modal) modal.classList.remove('open');
}

function addToCart(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;
  const existing = state.cart.find((i) => i.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({ id: product.id, name: product.name, price: product.price, qty: 1 });
  }
  persistCart();
  renderCart();
  openCart();
}

function changeQty(id, delta) {
  const item = state.cart.find((i) => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter((i) => i.id !== id);
  }
  persistCart();
  renderCart();
}

function persistCart() {
  localStorage.setItem('cedia-cart', JSON.stringify(state.cart));
}

function renderCart() {
  const container = el('#cartItems');
  el('#cartCount').textContent = state.cart.reduce((s, i) => s + i.qty, 0);

  if (!state.cart.length) {
    container.innerHTML = '<p style="color:var(--text-muted)">Tu carrito está vacío.</p>';
  } else {
    container.innerHTML = state.cart.map((i) => `
      <div class="cart-item">
        <div>
          <div>${i.name}</div>
          <div class="qty-controls">
            <button data-action="dec" data-id="${i.id}">−</button>
            ${i.qty}
            <button data-action="inc" data-id="${i.id}">+</button>
          </div>
        </div>
        <strong>${money(i.price * i.qty)}</strong>
      </div>
    `).join('');

    container.querySelectorAll('button[data-action]').forEach((btn) =>
      btn.addEventListener('click', () =>
        changeQty(btn.dataset.id, btn.dataset.action === 'inc' ? 1 : -1)
      )
    );
  }

  const total = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  el('#cartTotal').textContent = money(total);
}

function openCart() {
  el('#cartDrawer').classList.add('open');
  el('#cartOverlay').classList.add('open');
}
function closeCart() {
  el('#cartDrawer').classList.remove('open');
  el('#cartOverlay').classList.remove('open');
}

async function submitOrder(e) {
  e.preventDefault();
  if (!state.cart.length) return alert('Tu carrito está vacío.');

  const form = e.target;
  const customer = {
    name: form.name.value.trim(),
    phone: form.phone.value.trim(),
    email: form.email.value.trim() || undefined,
  };
  const shippingAddress = {
    nombre: customer.name,
    calle: form.calle.value.trim(),
    numero: form.numero.value.trim(),
    colonia: form.colonia.value.trim(),
    ciudad: form.ciudad.value.trim(),
    estado: form.estado.value.trim(),
    cp: form.cp.value.trim(),
    telefono: customer.phone,
  };
  const notes = form.notes.value.trim();

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Redirigiendo a Mercado Pago…';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s máximo

    let res;
    try {
      res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer, shippingAddress, items: state.cart, notes }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'No pudimos iniciar el cobro, intenta de nuevo.');
      return;
    }

    // El carrito se limpia hasta que el pago sea confirmado por Mercado Pago,
    // asi que aqui solo redirigimos; el webhook del servidor hace el resto.
    window.location.href = data.initPoint;
  } catch (err) {
    if (err.name === 'AbortError') {
      alert('El servidor está tardando demasiado en responder. Intenta de nuevo en un momento; si sigue pasando, avísale al administrador del sitio.');
    } else {
      alert('No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Pagar con Mercado Pago';
  }
}

el('#searchBtn').addEventListener('click', () => {
  state.query = el('#searchInput').value.trim();
  loadProducts();
});
el('#searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    state.query = el('#searchInput').value.trim();
    loadProducts();
  }
});

el('#cartToggle').addEventListener('click', openCart);
el('#closeCart').addEventListener('click', closeCart);
el('#cartOverlay').addEventListener('click', closeCart);
el('#checkoutForm').addEventListener('submit', submitOrder);

// ---------- Detalle de producto ----------
const productModalClose = el('#productModalClose');
const productModal = el('#productModal');

if (productModalClose) productModalClose.addEventListener('click', closeProduct);
if (productModal) {
  productModal.addEventListener('click', (e) => {
    if (e.target.id === 'productModal') closeProduct();
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeProduct();
});


el('#whatsappFloat').href = `https://wa.me/${window.COMPANY.phoneWhatsapp}?text=${encodeURIComponent('Hola, tengo una pregunta sobre un producto de Grupo CEDIA.')}`;

// ---------- Sesión de distribuidor ----------
state.distributor = null;

async function checkDistributorSession() {
  try {
    const res = await fetch('/api/distributor/session');
    if (!res.ok) { state.distributor = null; renderDistToggle(); return; }
    state.distributor = await res.json();
  } catch {
    state.distributor = null;
  }
  renderDistToggle();
}

function renderDistToggle() {
  const btn = el('#distToggle');
  if (state.distributor?.authenticated) {
    btn.textContent = `👤 ${state.distributor.businessName} · Salir`;
    btn.classList.add('logged-in');
  } else {
    btn.textContent = 'Soy distribuidor';
    btn.classList.remove('logged-in');
  }
}

el('#distToggle').addEventListener('click', async () => {
  if (state.distributor?.authenticated) {
    await fetch('/api/distributor/logout', { method: 'POST' });
    state.distributor = null;
    renderDistToggle();
    loadProducts(); // recargar con precios públicos
  } else {
    openDistModal();
  }
});

function openDistModal() {
  el('#distModal').classList.add('open');
}
function closeDistModal() {
  el('#distModal').classList.remove('open');
  el('#distLoginMsg').textContent = '';
  el('#distRegisterMsg').textContent = '';
}
el('#distModalClose').addEventListener('click', closeDistModal);
el('#distModal').addEventListener('click', (e) => { if (e.target.id === 'distModal') closeDistModal(); });

document.querySelectorAll('.modal-tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('.modal-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    el('#distLoginForm').hidden = !isLogin;
    el('#distRegisterForm').hidden = isLogin;
  })
);

el('#distLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = el('#distLoginMsg');
  msg.textContent = '';
  msg.className = 'modal-msg';
  const res = await fetch('/api/distributor/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: form.email.value.trim(), password: form.password.value }),
  });
  const data = await res.json();
  if (!res.ok) { msg.textContent = data.error || 'No se pudo iniciar sesión.'; return; }
  closeDistModal();
  form.reset();
  await checkDistributorSession();
  loadProducts(); // recargar con precios de distribuidor
});

el('#distRegisterForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = el('#distRegisterMsg');
  msg.textContent = '';
  msg.className = 'modal-msg';
  const payload = {
    businessName: form.businessName.value.trim(),
    contactName: form.contactName.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    rfc: form.rfc.value.trim(),
    password: form.password.value,
  };
  const res = await fetch('/api/distributor/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) { msg.textContent = data.error || 'No se pudo enviar la solicitud.'; return; }
  msg.textContent = data.message;
  msg.className = 'modal-msg ok';
  form.reset();
});

// ---------- Rastreo de pedido sin cuenta ----------
function openTrackModal() {
  el('#trackModal').classList.add('open');
}
function closeTrackModal() {
  el('#trackModal').classList.remove('open');
  el('#trackMsg').textContent = '';
  el('#trackResult').hidden = true;
}
el('#trackOrderLink').addEventListener('click', (e) => { e.preventDefault(); openTrackModal(); });
el('#trackModalClose').addEventListener('click', closeTrackModal);
el('#trackModal').addEventListener('click', (e) => { if (e.target.id === 'trackModal') closeTrackModal(); });

const fulfillmentLabels = {
  automatico_ok: 'Enviado a surtir con el mayorista',
  automatico_error: 'Hubo un problema, lo estamos revisando',
  pendiente_manual: 'En proceso de gestión',
  manual_ok: 'Ya en camino',
};

el('#trackForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = el('#trackMsg');
  const resultBox = el('#trackResult');
  msg.textContent = '';
  resultBox.hidden = true;

  const res = await fetch('/api/orders/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: form.orderId.value.trim(), phone: form.phone.value.trim() }),
  });
  const data = await res.json();
  if (!res.ok) { msg.textContent = data.error || 'No se pudo consultar el pedido.'; return; }

  const paymentStatusLabels = { pagado: 'Pago confirmado', rechazado: 'Pago rechazado', reembolsado: 'Pago reembolsado', cancelado: 'Pago cancelado', pendiente: 'Pendiente de pago' };
  const orderStatusLabels = { recibido: 'Pedido recibido', preparando: 'Preparando pedido', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
  const steps = ['recibido', 'preparando', 'enviado', 'entregado'];
  const currentIndex = steps.indexOf(data.orderStatus || 'recibido');
  const timeline = data.orderStatus === 'cancelado'
    ? '<div class="track-cancelled">Pedido cancelado</div>'
    : `<div class="track-timeline">${steps.map((step, i) => `<div class="track-step ${i < currentIndex ? 'done' : i === currentIndex ? 'current' : ''}"><span>${i < currentIndex ? '✓' : i === currentIndex ? '●' : '○'}</span><small>${orderStatusLabels[step]}</small></div>`).join('')}</div>`;

  resultBox.innerHTML = `
    <div class="track-summary"><span class="track-status ${data.paymentStatus}">${paymentStatusLabels[data.paymentStatus] || data.paymentStatus}</span><strong>${orderStatusLabels[data.orderStatus] || data.orderStatus}</strong></div>
    ${timeline}
    <p><strong>Folio:</strong> ${data.id}</p>
    <p><strong>Fecha:</strong> ${new Date(data.createdAt).toLocaleString('es-MX')}</p>
    <p><strong>Total:</strong> ${money(data.total)}</p>
    ${data.trackingNumber ? `<div class="tracking-box"><strong>Envío</strong><br>Paquetería: ${data.carrier || '—'}<br>Guía: ${data.trackingNumber}</div>` : ''}
   <div class="track-products">

  <h4>Productos de tu pedido</h4>

  ${data.items.map((item) => {

    const qty = Number(item.qty || 1);
    const price = Number(item.price || 0);

    const subtotal = Number(
      item.subtotal ?? (price * qty)
    );

    return `
      <div class="track-product">

        ${
          item.image
            ? `
              <div class="track-product__image">
                <img
                  src="${item.image}"
                  alt="${item.name || 'Producto'}"
                >
              </div>
            `
            : ''
        }

        <div class="track-product__info">

          <strong>
            ${item.name || 'Producto'}
          </strong>

          ${
            item.sku
              ? `<span class="track-product__sku">
                   Modelo: ${item.sku}
                 </span>`
              : ''
          }

          ${
            item.description
              ? `<p class="track-product__description">
                   ${item.description}
                 </p>`
              : ''
          }

          <div class="track-product__price">

            <span>
              ${qty} × ${money(price)}
            </span>

            <strong>
              ${money(subtotal)}
            </strong>

          </div>

        </div>

      </div>
    `;
  }).join('')}

</div>
  `;
  resultBox.hidden = false;
});

checkDistributorSession();
renderCart();
loadPromoBanners();
loadProducts();
