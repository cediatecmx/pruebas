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
  el('#resultsCount').textContent = `${state.products.length} producto(s) encontrados`;

  if (!state.products.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">No encontramos productos con ese filtro.</p>';
    return;
  }

  grid.innerHTML = state.products.map((p) => `
    <div class="product-card" data-source="${p.source}">
      <img src="${p.images?.[0] || ''}" alt="${p.name}" loading="lazy" />
      <span class="brand-tag">${p.brand || p.source}</span>
      <h3>${p.name}</h3>
      <div class="price-row">
        <span class="price">${money(p.price)}</span>
        <span class="stock">${p.stock > 0 ? p.stock + ' disp.' : 'agotado'}</span>
      </div>
      <button ${p.stock > 0 ? '' : 'disabled'} data-id="${p.id}">Agregar al carrito</button>
    </div>
  `).join('');

  grid.querySelectorAll('button[data-id]').forEach((btn) =>
    btn.addEventListener('click', () => addToCart(btn.dataset.id))
  );
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
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer, shippingAddress, items: state.cart, notes }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'No pudimos iniciar el cobro, intenta de nuevo.');
      return;
    }

    // El carrito se limpia hasta que el pago sea confirmado por Mercado Pago,
    // asi que aqui solo redirigimos; el webhook del servidor hace el resto.
    window.location.href = data.initPoint;
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
document.querySelectorAll('input[name="source"]').forEach((input) =>
  input.addEventListener('change', (e) => {
    state.source = e.target.value;
    loadProducts();
  })
);
el('#cartToggle').addEventListener('click', openCart);
el('#closeCart').addEventListener('click', closeCart);
el('#cartOverlay').addEventListener('click', closeCart);
el('#checkoutForm').addEventListener('submit', submitOrder);

el('#whatsappFloat').href = `https://wa.me/${window.COMPANY.phoneWhatsapp}?text=${encodeURIComponent('Hola, tengo una pregunta sobre un producto de Grupo CEDIA.')}`;

renderCart();
loadProducts();
