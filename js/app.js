/* ==========================================================
   SQUISHLAND — Application
   ========================================================== */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

  const store = {
    get(k, d) { try { const v = localStorage.getItem('squishland:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('squishland:' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  const state = {
    cart: store.get('cart', []).filter(i => i && byId[i.id]).map(i => ({ ...i, qty: Math.max(1, Math.min(MAX_ITEMS, i.qty | 0)) })),
    wish: new Set(store.get('wish', []).filter(id => byId[id])),
    filters: { cat: 'all', tag: null, q: '', sort: 'featured' },
    shown: 12,
    coupon: !!store.get('coupon', false),
    goal: 0,
    drawerTab: 'cart'
  };

  const euro = n => n.toFixed(2).replace('.', ',') + ' €';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const plural = n => `${n} ${n > 1 ? 'squishies' : 'squishy'}`;
  const photoOf = p => `images/${p.id}.jpg`;
  const img = (p, cls = '') => `<img class="${cls}" src="${photoOf(p)}" alt="${esc(p.name)}" loading="lazy" decoding="async" draggable="false"/>`;
  const stars = r => `<span class="stars" aria-label="Note ${r.toFixed(1)} sur 5">★ ${r.toFixed(1).replace('.', ',')}</span>`;

  const hash = id => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const sold = p => 38 + (hash(p.id) % 190);
  const stockLeft = p => (hash(p.id) % 4 === 0 ? 3 + (hash(p.id) % 7) : 0);
  const COUPON = { code: 'BIENVENUE10', rate: 0.10 };

  const ICON = {
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5C19 15.6 12 20 12 20z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };
  const BADGE = { best: 'Best-seller', new: 'Nouveau', limited: 'Édition limitée' };

  /* ---------- Photos supplémentaires (fiche produit) ---------- */
  const PHOTOS = {};
  const probe = url => new Promise(res => { const i = new Image(); i.onload = () => res(url); i.onerror = () => res(null); i.src = url; });
  async function photosOf(p) {
    if (!PHOTOS[p.id]) PHOTOS[p.id] = [photoOf(p), ...(await Promise.all([2, 3, 4].map(n => probe(`images/${p.id}-${n}.jpg`)))).filter(Boolean)];
    return PHOTOS[p.id];
  }

  /* ---------- Notifications ---------- */
  function toast(html, thumbId, action) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = (thumbId ? img(byId[thumbId], 't-thumb') : '') + `<span>${html}</span>` + (action ? `<button class="toast-act">${action.label}</button>` : '');
    if (action) el.querySelector('.toast-act').addEventListener('click', () => { el.remove(); action.fn(); });
    box.replaceChildren(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, action ? 4200 : 2800);
  }

  /* ---------- Header ---------- */
  const header = $('#header');
  addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 10), { passive: true });
  $('#burger').addEventListener('click', () => { $('#nav').classList.toggle('open'); });
  $$('#nav a').forEach(a => a.addEventListener('click', () => $('#nav').classList.remove('open')));

  /* ---------- Recherche ---------- */
  const search = $('#search'), searchInput = $('#searchInput'), searchResults = $('#searchResults');
  $('#searchBtn').addEventListener('click', () => {
    search.classList.toggle('open');
    if (search.classList.contains('open')) searchInput.focus();
  });
  function renderSearch() {
    const q = norm(searchInput.value.trim());
    if (!q) { searchResults.innerHTML = ''; return; }
    const res = PRODUCTS.filter(p => norm(p.name + ' ' + CATEGORIES[p.cat]).includes(q)).slice(0, 6);
    searchResults.innerHTML = res.length
      ? res.map(p => `<button class="sr-item" data-id="${p.id}">${img(p)}<span><b>${esc(p.name)}</b><small>${CATEGORIES[p.cat]} · ${euro(p.price)}</small></span></button>`).join('')
      : `<p class="sr-empty">Aucun résultat pour « ${esc(searchInput.value)} »</p>`;
  }
  searchInput.addEventListener('input', renderSearch);
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyFilter({ q: searchInput.value.trim() });
      search.classList.remove('open');
    }
  });
  searchResults.addEventListener('click', e => {
    const it = e.target.closest('.sr-item');
    if (it) { search.classList.remove('open'); openProduct(it.dataset.id); }
  });
  document.addEventListener('click', e => { if (!search.contains(e.target)) search.classList.remove('open'); });

  /* ---------- Cartes produit ---------- */
  const inCart = id => (state.cart.find(i => i.id === id) || { qty: 0 }).qty;
  function cardHtml(p) {
    const tag = p.tags.find(t => BADGE[t]);
    return `<article class="card" data-id="${p.id}">
      <div class="card-media">
        ${img(p)}
        ${tag ? `<span class="badge ${tag}">${BADGE[tag]}</span>` : ''}
        <button class="wish ${state.wish.has(p.id) ? 'on' : ''}" data-act="wish" aria-label="Ajouter ${esc(p.name)} aux favoris">${ICON.heart}</button>
        <button class="quick-add ${inCart(p.id) ? 'done' : ''}" data-act="add" aria-label="Ajouter ${esc(p.name)} au panier">${inCart(p.id) ? ICON.check + `<span>Dans le panier (${inCart(p.id)})</span>` : ICON.plus + '<span>Ajouter</span>'}</button>
      </div>
      <div class="card-body">
        <h3>${esc(p.name)}</h3>
        <div class="card-meta"><span>${CATEGORIES[p.cat]}</span>${stars(p.rating)}</div>
        <div class="card-price">${euro(p.price)}</div>
        ${stockLeft(p) ? `<div class="card-urgent">Plus que ${stockLeft(p)} en stock</div>` : `<div class="card-sold">${sold(p)} vendus cette semaine</div>`}
      </div>
    </article>`;
  }
  function onGridClick(e) {
    const card = e.target.closest('.card');
    if (!card) return;
    const p = byId[card.dataset.id];
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'wish') { toggleWish(p.id); return; }
    if (act && act.dataset.act === 'add') {
      addToCart(p.id, 1);
      act.classList.add('done'); act.innerHTML = ICON.check + `<span>Dans le panier (${inCart(p.id)})</span>`;
      return;
    }
    openProduct(p.id);
  }

  /* ---------- Univers ---------- */
  const UNIVERSES = [
    { label: 'Sensoriel', sub: 'Perles, gel et billes', id: 'raisin-perles', f: { cat: 'sensoriel' } },
    { label: 'Gourmandises', sub: 'Beurres, donuts, chocolat', id: 'donuts-pastel', f: { cat: 'gourmandises' } },
    { label: 'Fruits', sub: 'Mangue, pastèque, pomme', id: 'pasteque-juicy', f: { cat: 'fruits' } },
    { label: 'Fantaisie', sub: 'Lingots, savons, potions', id: 'lingot-or', f: { cat: 'fantaisie' } },
    { label: 'Halloween', sub: 'Édition de saison', id: 'citrouille-doree', f: { cat: 'halloween' } }
  ];
  $('#universes').innerHTML = UNIVERSES.map((u, i) => `
    <button class="universe" data-i="${i}">
      <span class="universe-media">${img(byId[u.id])}</span>
      <span class="universe-label"><b>${u.label}</b><small>${u.sub}</small></span>
    </button>`).join('');
  $('#universes').addEventListener('click', e => {
    const b = e.target.closest('.universe');
    if (b) applyFilter(UNIVERSES[+b.dataset.i].f);
  });

  /* ---------- Best-sellers ---------- */
  const best = PRODUCTS.filter(p => p.tags.includes('best')).sort((a, b) => b.reviews - a.reviews).slice(0, 4);
  $('#bestGrid').innerHTML = best.map(cardHtml).join('');
  $('#bestGrid').addEventListener('click', onGridClick);

  /* ---------- Halloween ---------- */
  $('#hwThumbs').innerHTML = PRODUCTS.filter(p => p.cat === 'halloween').slice(0, 4)
    .map(p => `<button data-id="${p.id}" aria-label="${esc(p.name)}">${img(p)}</button>`).join('');
  $('#hwThumbs').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) openProduct(b.dataset.id); });

  /* ---------- Packs ---------- */
  const PACK_UI = [
    { min: 1, name: 'Solo', sub: 'Pour essayer' },
    { min: 2, name: 'Duo', sub: 'Un pour toi, un à offrir' },
    { min: 6, name: 'Pack 6', sub: 'Le meilleur rapport pour commencer', pop: true },
    { min: 12, name: 'Méga pack', sub: 'Le maximum par commande', hot: true }
  ];
  $('#packGrid').innerHTML = PACK_UI.map(u => {
    const pk = PACKS.find(p => p.min === u.min);
    return `<button class="pack ${u.hot ? 'hot' : ''} ${u.pop ? 'pop' : ''}" data-n="${u.min}">
      ${u.hot ? '<span class="pack-flag">Le plus complet</span>' : u.pop ? '<span class="pack-flag pop">Le plus choisi</span>' : ''}
      <span class="pack-name">${u.name}</span>
      <span class="pack-count">${plural(u.min)}</span>
      <span class="pack-price">${euro(pk.price)}</span>
      <span class="pack-unit">${u.min > 1 ? `soit ${euro(pk.price / u.min)} pièce` : 'Livraison offerte'}${u.min > 2 ? `<em>−${Math.round((1 - pk.price / (u.min * PACKS[0].price)) * 100)} %</em>` : ''}</span>
      <span class="pack-sub">${u.sub}</span>
      <span class="pack-cta">Choisir ${u.min > 1 ? `mes ${u.min}` : 'mon squishy'} ${ICON.arrow}</span>
    </button>`;
  }).join('');
  $('#packGrid').addEventListener('click', e => {
    const b = e.target.closest('.pack');
    if (!b) return;
    state.goal = +b.dataset.n;
    renderPackbar();
    applyFilter({});
    toast(state.goal > 1 ? `Choisis tes <b>${state.goal} squishies</b> : on te dit où tu en es.` : 'Choisis ton squishy.');
  });

  /* ---------- Calendrier de l'Avent ---------- */
  $('#adventPrice').textContent = euro(CALENDAR.price);
  const DOORS = [7, 19, 2, 13, 24, 9, 16, 4, 21, 11, 1, 18, 6, 23, 14, 3, 20, 10, 15, 22, 5, 12, 17, 8];
  $('#adventGrid').innerHTML = DOORS.map((n, i) => `<button class="door ${n === 24 ? 'big' : ''}" aria-label="Case ${n}">
      ${img(PRODUCTS[(i * 3) % PRODUCTS.length])}<span class="door-face">${n}</span></button>`).join('');
  $('#adventGrid').addEventListener('click', e => { const d = e.target.closest('.door'); if (d) d.classList.toggle('open'); });
  if (CALENDAR.url && CALENDAR.url !== '#') $('#adventBtn').setAttribute('href', CALENDAR.url);
  if (!CALENDAR.url || CALENDAR.url === '#') {
    const b = $('#adventBtn');
    b.textContent = 'Bientôt disponible'; b.removeAttribute('href'); b.classList.add('disabled'); b.setAttribute('aria-disabled', 'true');
  }

  /* ---------- Boutique ---------- */
  const TABS = [
    { label: 'Tout', cat: 'all' },
    { label: 'Nouveautés', tag: 'new' },
    { label: 'Best-sellers', tag: 'best' },
    { label: 'Sensoriel', cat: 'sensoriel' },
    { label: 'Gourmandises', cat: 'gourmandises' },
    { label: 'Fruits', cat: 'fruits' },
    { label: 'Fantaisie', cat: 'fantaisie' },
    { label: 'Halloween', cat: 'halloween' }
  ];
  function renderTabs() {
    const f = state.filters;
    $('#chips').innerHTML = TABS.map((t, i) => {
      const on = !f.q && (t.tag ? f.tag === t.tag : (!f.tag && f.cat === t.cat));
      return `<button class="tab ${on ? 'active' : ''}" data-i="${i}" role="tab" aria-selected="${on}">${t.label}</button>`;
    }).join('');
  }
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (!b) return;
    const t = TABS[+b.dataset.i];
    applyFilter({ cat: t.cat || 'all', tag: t.tag || null }, false);
  });

  function filtered() {
    const f = state.filters, q = norm(f.q);
    const list = PRODUCTS.filter(p =>
      (f.cat === 'all' || p.cat === f.cat) && (!f.tag || p.tags.includes(f.tag)) &&
      (!q || norm(p.name + ' ' + CATEGORIES[p.cat]).includes(q)));
    const sorters = {
      featured: (a, b) => a.rank - b.rank,
      rise: (a, b) => b.rise - a.rise,
      rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
      new: (a, b) => b.tags.includes('new') - a.tags.includes('new') || a.rank - b.rank
    };
    return list.sort(sorters[f.sort]);
  }
  function renderGrid() {
    const list = filtered();
    $('#productGrid').innerHTML = list.slice(0, state.shown).map(cardHtml).join('');
    $('#emptyState').hidden = list.length > 0;
    $('#moreBtn').parentElement.hidden = list.length <= state.shown;
    $('#resultsCount').textContent = plural(list.length) + (state.filters.q ? ` pour « ${state.filters.q} »` : '');
  }
  $('#productGrid').addEventListener('click', onGridClick);
  $('#moreBtn').addEventListener('click', () => { state.shown += 12; renderGrid(); });
  $('#sortSelect').addEventListener('change', e => { state.filters.sort = e.target.value; renderGrid(); });
  $('#emptyReset').addEventListener('click', () => applyFilter({}, false));

  function applyFilter(f, scroll = true) {
    state.filters = { cat: 'all', tag: null, q: '', sort: state.filters.sort, ...f };
    state.shown = 12;
    searchInput.value = state.filters.q;
    renderTabs(); renderGrid();
    if (scroll) $('#boutique').scrollIntoView({ behavior: 'smooth' });
  }
  $$('[data-filter-cat]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); applyFilter({ cat: el.dataset.filterCat }); }));

  /* ---------- Favoris ---------- */
  function toggleWish(id) {
    state.wish.has(id) ? state.wish.delete(id) : state.wish.add(id);
    store.set('wish', [...state.wish]);
    $$(`.card[data-id="${id}"] .wish`).forEach(b => b.classList.toggle('on', state.wish.has(id)));
    if (state.wish.has(id)) toast(`<b>${esc(byId[id].name)}</b> ajouté aux favoris`, id);
    updateBadges();
    if (pmState && pmState.id === id) renderProductModal();
    if (drawer.classList.contains('open')) renderDrawer();
  }

  /* ---------- Panier ---------- */
  const validPack = n => PACKS.some(p => p.min === n);
  const cartCount = () => state.cart.reduce((s, i) => s + i.qty, 0);
  function addToCart(id, qty, silent) {
    const p = byId[id];
    const room = MAX_ITEMS - cartCount();
    if (room <= 0) { toast(`${MAX_ITEMS} squishies maximum par commande`); return; }
    const add = Math.min(room, Math.max(1, qty | 0));
    const line = state.cart.find(i => i.id === id);
    if (line) line.qty += add; else state.cart.push({ key: id, id, size: 'M', v: 0, qty: add });
    saveCart();
    const c = $('#cartBtn');
    c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse');
    if (silent) return;
    const n = cartCount();
    if (state.goal > 1 && n >= state.goal) { state.goal = 0; openDrawer('cart'); return; }
    if (state.goal > 1) { toast(`Pack ${state.goal} : <b>${n}/${state.goal}</b> · encore ${state.goal - n}`, id, { label: 'Panier', fn: () => openDrawer('cart') }); return; }
    toast(`<b>${esc(p.name)}</b> ajouté${add > 1 ? ` ×${add}` : ''}`, id, { label: 'Voir le panier', fn: () => openDrawer('cart') });
  }
  function totals() {
    const sub = state.cart.reduce((s, i) => s + byId[i.id].price * i.qty, 0);
    const packTotal = priceFor(cartCount());
    const coupon = state.coupon && sub ? +(packTotal * COUPON.rate).toFixed(2) : 0;
    const total = +(packTotal - coupon).toFixed(2);
    return { sub, packTotal, discount: +(sub - packTotal).toFixed(2), coupon, total };
  }
  function packHint() {
    const n = cartCount(), next = nextPack(n);
    if (!n) return `Packs : 2 pour ${euro(PACKS[1].price)} · 6 pour ${euro(PACKS[2].price)} · 12 pour ${euro(PACKS[3].price)}`;
    if (!next) return `Pack maximum : ${MAX_ITEMS} squishies pour ${euro(priceFor(n))}`;
    const k = next.min - n;
    return `Encore ${plural(k)} pour le pack ${next.min} à ${euro(next.price)}`;
  }
  function saveCart() { store.set('cart', state.cart); updateBadges(); renderPackbar(); if (drawer.classList.contains('open')) renderDrawer(); }
  function updateBadges() {
    const cc = cartCount(), wc = state.wish.size;
    $('#cartCount').textContent = cc; $('#cartCount').classList.toggle('show', cc > 0);
    $('#wishCount').textContent = wc; $('#wishCount').classList.toggle('show', wc > 0);
    $('#drawerCartCount').textContent = cc; $('#drawerWishCount').textContent = wc;
  }

  /* ---------- Bouton de paiement ---------- */
  function renderPackbar() {
    const n = cartCount();
    const btn = $('#checkoutBtn');
    const miss = n && !validPack(n) ? nextPack(n).min - n : 0;
    btn.textContent = !n ? 'Passer commande' : miss ? `Encore ${plural(miss)} pour valider` : `Passer commande · ${euro(totals().total)}`;
    btn.classList.toggle('is-blocked', !!miss);
  }

  /* ---------- Tiroir ---------- */
  const drawer = $('#drawer'), overlay = $('#overlay');
  function lock() { document.body.classList.add('locked'); overlay.classList.add('show'); }
  function unlockIfNone() {
    if (!drawer.classList.contains('open') && !$$('.modal.open').length) { document.body.classList.remove('locked'); overlay.classList.remove('show'); }
  }
  function openDrawer(tab) {
    closeModals();
    state.drawerTab = tab || 'cart';
    renderDrawer();
    drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
    lock();
  }
  function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); unlockIfNone(); }
  $('#cartBtn').addEventListener('click', () => openDrawer('cart'));
  $('#wishBtn').addEventListener('click', () => openDrawer('wish'));
  $$('.drawer-tab').forEach(t => t.addEventListener('click', () => { state.drawerTab = t.dataset.tab; renderDrawer(); }));

  function tierNote() {
    const n = cartCount(), t = totals();
    if (!n) return `<b>Packs</b> : 2 pour ${euro(PACKS[1].price)} · 6 pour ${euro(PACKS[2].price)} · 12 pour ${euro(PACKS[3].price)}`;
    const next = nextPack(n);
    const msg = next ? `Encore <b>${plural(next.min - n)}</b> pour le pack ${next.min} à <b>${euro(next.price)}</b>` : `<b>Pack maximum</b> atteint : ${plural(n)} pour ${euro(t.packTotal)}`;
    const ticks = PACKS.slice(1).map(p => `<i class="${n >= p.min ? 'on' : ''}" style="left:${p.min / MAX_ITEMS * 100}%"><em>${p.min}</em></i>`).join('');
    return `<p>${msg}</p><div class="tier-track"><span style="width:${n / MAX_ITEMS * 100}%"></span>${ticks}</div>`;
  }
  function renderDrawer() {
    const tab = state.drawerTab, body = $('#drawerBody');
    $$('.drawer-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $('#packNote').hidden = tab !== 'cart' || !state.cart.length;
    $('#packNote').innerHTML = tierNote();
    $('#drawerFoot').hidden = tab !== 'cart' || !state.cart.length;

    if (tab === 'wish') {
      const items = [...state.wish].map(id => byId[id]);
      body.innerHTML = items.length ? items.map(p => `
        <div class="line" data-id="${p.id}">
          <button class="line-media" data-act="view">${img(p)}</button>
          <div class="line-info"><b>${esc(p.name)}</b><small>${CATEGORIES[p.cat]} · ${euro(p.price)}</small>
            <button class="btn btn-cta btn-sm" data-act="wish-add">Ajouter au panier</button></div>
          <div class="line-side"><span></span><button class="link muted" data-act="wish-remove">Retirer</button></div>
        </div>`).join('')
        : emptyHtml('Aucun favori pour l\'instant', 'Touche le cœur d\'un squishy pour le garder ici.');
      return;
    }
    if (!state.cart.length) { body.innerHTML = emptyHtml('Ton panier est vide', 'Choisis un squishy ou compose un pack.'); return; }
    body.innerHTML = state.cart.map(i => {
      const p = byId[i.id];
      return `<div class="line" data-id="${p.id}">
        <button class="line-media" data-act="view">${img(p)}</button>
        <div class="line-info"><b>${esc(p.name)}</b><small>${CATEGORIES[p.cat]} · ${euro(p.price)} l'unité</small>
          <div class="qty"><button data-act="dec" aria-label="Moins">−</button><span>${i.qty}</span><button data-act="inc" aria-label="Plus">+</button></div></div>
        <div class="line-side"><button class="link muted" data-act="remove" aria-label="Retirer ${esc(p.name)}">Retirer</button></div>
      </div>`;
    }).join('') + '<div id="upsell"></div>';
    const t = totals();
    $('#totals').innerHTML = `<div><span>Sous-total (${plural(cartCount())})</span><span>${euro(t.sub)}</span></div>` +
      (t.discount > 0 ? `<div class="discount"><span>Tu économises avec les packs</span><span>−${euro(t.discount)}</span></div>` : '') +
      (t.coupon > 0 ? `<div class="discount"><span>Code ${COUPON.code} (−10 %)</span><span>−${euro(t.coupon)}</span></div>` : '') +
      `<div><span>Livraison</span><span class="free">Offerte</span></div><div class="grand"><span>Total</span><span>${euro(t.total)}</span></div>`;
    $('#promo').hidden = state.coupon;
    renderPackbar();
    renderUpsell();
  }

  function emptyHtml(title, text) {
    return `<div class="drawer-empty"><h4>${title}</h4><p>${text}</p><button class="btn btn-dark" data-act="shop">Voir la boutique</button></div>`;
  }
  $('#drawerBody').addEventListener('click', e => {
    const up = e.target.closest('[data-up]');
    if (up) { addToCart(up.dataset.up, 1, true); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'shop') { closeDrawer(); $('#boutique').scrollIntoView({ behavior: 'smooth' }); return; }
    const id = act.closest('.line').dataset.id;
    if (a === 'view') { openProduct(id); return; }
    if (a === 'wish-add') { addToCart(id, 1); return; }
    if (a === 'wish-remove') { toggleWish(id); return; }
    const item = state.cart.find(i => i.id === id);
    if (!item) return;
    if (a === 'remove' || (a === 'dec' && item.qty === 1)) state.cart = state.cart.filter(i => i !== item);
    else if (a === 'dec') item.qty--;
    else if (a === 'inc') { if (cartCount() >= MAX_ITEMS) { toast(`${MAX_ITEMS} squishies maximum par commande`); return; } item.qty++; }
    saveCart();
  });
  /* ---------- Vente additionnelle dans le panier ---------- */
  function renderUpsell() {
    const n = cartCount(), next = nextPack(n), box = $('#upsell');
    if (!box) return;
    if (!n || !next || state.drawerTab !== 'cart') { box.innerHTML = ''; return; }
    const k = next.min - n;
    const picks = PRODUCTS.filter(p => !state.cart.some(i => i.id === p.id)).sort((a, b) => b.reviews - a.reviews).slice(0, 3);
    box.innerHTML = `<div class="upsell">
      <p><b>Encore ${plural(k)}</b> pour le pack à ${euro(next.price)}</p>
      <div class="upsell-row">${picks.map(p => `<button data-up="${p.id}" aria-label="Ajouter ${esc(p.name)}">${img(p)}<span>${esc(p.name)}</span><i>+ ${euro(p.price)}</i></button>`).join('')}</div>
    </div>`;
  }

  /* ---------- Paiement (démo, à brancher sur Stripe / Shopify) ---------- */
  const co = $('#checkoutModal');
  function openCheckout() {
    if (!state.cart.length) return;
    const n = cartCount();
    if (!validPack(n)) { const k = nextPack(n); toast(`Les commandes se font par pack de 1, 2, 6 ou 12 squishies. Ajoute-en encore <b>${k.min - n}</b> pour le pack de ${k.min}.`); return; }
    /* Redirection vers la page de livraison pour tous les paniers non vides. */
    location.href = 'shipping.html'; return;
    const t = totals();
    $('#coContent').innerHTML = `
      <div class="co-main">
        <h2>Finaliser ma commande</h2>
        <div class="co-express">
          <button class="btn btn-apple" data-act="pay">Payer avec  Pay</button>
          <button class="btn btn-paypal" data-act="pay">PayPal</button>
        </div>
        <div class="co-or"><span>ou par carte</span></div>
        <form id="coForm" novalidate>
          <input name="email" type="email" placeholder="Email" autocomplete="email" required />
          <div class="co-2"><input name="fn" placeholder="Prénom" autocomplete="given-name" required /><input name="ln" placeholder="Nom" autocomplete="family-name" required /></div>
          <input name="adr" placeholder="Adresse" autocomplete="street-address" required />
          <div class="co-2"><input name="zip" placeholder="Code postal" autocomplete="postal-code" required /><input name="city" placeholder="Ville" autocomplete="address-level2" required /></div>
          <input name="card" placeholder="Numéro de carte" inputmode="numeric" autocomplete="cc-number" required />
          <div class="co-2"><input name="exp" placeholder="MM/AA" autocomplete="cc-exp" required /><input name="cvc" placeholder="CVC" inputmode="numeric" autocomplete="cc-csc" required /></div>
          <button class="btn btn-cta w-full" type="submit">Payer ${euro(t.total)}</button>
          <p class="co-safe">🔒 Paiement chiffré · Livraison offerte en 3 jours · Retours 30 jours</p>
        </form>
      </div>
      <aside class="co-sum">
        <h3>Ta commande</h3>
        ${state.cart.map(i => `<div class="co-line">${img(byId[i.id])}<span>${esc(byId[i.id].name)} <small>× ${i.qty}</small></span><b>${euro(byId[i.id].price * i.qty)}</b></div>`).join('')}
        <div class="co-tot"><span>Sous-total</span><span>${euro(t.sub)}</span></div>
        ${t.discount > 0 ? `<div class="co-tot good"><span>Remise pack</span><span>−${euro(t.discount)}</span></div>` : ''}
        ${t.coupon > 0 ? `<div class="co-tot good"><span>${COUPON.code}</span><span>−${euro(t.coupon)}</span></div>` : ''}
        <div class="co-tot"><span>Livraison</span><span>Offerte</span></div>
        <div class="co-tot grand"><span>Total</span><span>${euro(t.total)}</span></div>
        <p class="co-guar">🛡️ Satisfait ou remboursé 30 jours</p>
      </aside>`;
    co.classList.add('open'); co.setAttribute('aria-hidden', 'false'); lock();
  }
  function coSuccess() {
    $('#coContent').innerHTML = `<div class="co-done"><div class="co-check">${ICON.check}</div><h2>Merci, commande confirmée !</h2>
      <p>Version de démonstration : aucun paiement n'a été effectué. Branche un prestataire de paiement pour encaisser.</p>
      <button class="btn btn-dark" data-act="done">Retour à la boutique</button></div>`;
    state.cart = []; saveCart();
  }
  co.addEventListener('click', e => {
    if (e.target === co) { closeModals(); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'pay') coSuccess();
    if (a.dataset.act === 'done') closeModals();
  });
  co.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target; let ok = true;
    [...f.elements].forEach(el => { if (el.name) { const bad = !el.value.trim() || (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim())); el.classList.toggle('error', bad); if (bad) ok = false; } });
    if (ok) coSuccess();
  });
  $('#checkoutBtn').addEventListener('click', openCheckout);

  /* ---------- Compte à rebours d'expédition ---------- */
  function shipTick() {
    const now = new Date(), cut = new Date(now); cut.setHours(14, 0, 0, 0);
    const el = $('#shipTimer'), day = now.getDay();
    if (now < cut && day !== 0 && day !== 6) {
      const d = Math.floor((cut - now) / 1000), h = Math.floor(d / 3600), m = Math.floor(d % 3600 / 60), sec = d % 60;
      el.innerHTML = `Commande dans <b>${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s</b> : expédié aujourd'hui`;
    } else el.textContent = 'Commande maintenant : expédié le prochain jour ouvré';
  }
  shipTick(); setInterval(shipTick, 1000);

  /* ---------- Preuve sociale en direct ---------- */
  const WHO = ['Léa', 'Hugo', 'Manon', 'Yanis', 'Chloé', 'Maël', 'Jade', 'Noah', 'Inès', 'Lucas'], WHERE = ['Lyon', 'Paris', 'Lille', 'Nantes', 'Bordeaux', 'Nice', 'Rennes', 'Toulouse', 'Metz'];
  function liveToast() {
    if (document.body.classList.contains('locked')) return;
    const p = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
    toast(`<b>${WHO[Math.floor(Math.random() * WHO.length)]}</b> de ${WHERE[Math.floor(Math.random() * WHERE.length)]} vient de commander <b>${esc(p.name)}</b>`, p.id);
  }
  setTimeout(() => { liveToast(); setInterval(liveToast, 22000); }, 9000);

  /* ---------- Barre mobile ---------- */
  const mcta = $('#mobileCta');
  addEventListener('scroll', () => mcta.classList.toggle('show', scrollY > 500 && !document.body.classList.contains('has-packbar')), { passive: true });

  /* ---------- Code promo ---------- */
  $('#promoForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#promoInput').value.trim().toUpperCase(), msg = $('#promoMsg');
    if (v === COUPON.code) { state.coupon = true; store.set('coupon', true); saveCart(); }
    else { msg.textContent = 'Ce code n\'est pas valide.'; msg.className = 'promo-msg err'; }
  });

  /* ---------- Fiche produit ---------- */
  const pm = $('#productModal');
  let pmState = null;
  async function openProduct(id) {
    const p = byId[id];
    if (!p) return;
    closeDrawer();
    pmState = { id, qty: 1, photo: 0, photos: [photoOf(p)] };
    renderProductModal();
    pm.classList.add('open'); pm.setAttribute('aria-hidden', 'false');
    lock();
    const photos = await photosOf(p);
    if (pmState && pmState.id === id && photos.length > 1) { pmState.photos = photos; renderProductModal(); }
  }
  const dots = (v, max = 5) => Array.from({ length: max }, (_, k) => `<i class="${k < v ? 'on' : ''}"></i>`).join('');
  function renderProductModal() {
    const p = byId[pmState.id], s = pmState;
    const tag = p.tags.find(t => BADGE[t]);
    const n = cartCount(), room = Math.max(1, MAX_ITEMS - n);
    s.qty = Math.min(s.qty, room);
    const delta = +(priceFor(n + s.qty) - priceFor(n)).toFixed(2);
    const reviews = REVIEWS.filter(r => r.product === p.id).slice(0, 2);
    const shown = reviews.length ? reviews : REVIEWS.slice(0, 2);
    const related = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id).sort((x, y) => y.reviews - x.reviews).slice(0, 4);
    $('#pmContent').innerHTML = `
      <div class="pm-media">
        <img class="pm-main" src="${s.photos[s.photo]}" alt="${esc(p.name)}" />
        ${s.photos.length > 1 ? `<div class="pm-thumbs">${s.photos.map((u, i) => `<button class="${i === s.photo ? 'active' : ''}" data-photo="${i}" aria-label="Photo ${i + 1}"><img src="${u}" alt=""/></button>`).join('')}</div>` : ''}
      </div>
      <div class="pm-info">
        <span class="kicker">${CATEGORIES[p.cat]}${tag ? ` · ${BADGE[tag]}` : ''}</span>
        <h2>${esc(p.name)}</h2>
        <div class="pm-rating">${stars(p.rating)}<span>${p.reviews.toLocaleString('fr-FR')} avis</span></div>
        <div class="pm-proof"><b>${sold(p)}</b> vendus cette semaine${stockLeft(p) ? ` · <em>plus que ${stockLeft(p)} en stock</em>` : ''}</div>
        <div class="pm-price">${euro(p.price)}</div>
        <p class="pm-desc">${esc(p.desc)}</p>
        <dl class="pm-specs">
          <div><dt>Douceur</dt><dd><span class="dots">${dots(p.soft)}</span></dd></div>
          <div><dt>Remontée</dt><dd>${p.rise} s</dd></div>
          <div><dt>Âge</dt><dd>Dès 3 ans</dd></div>
        </dl>
        <div class="pm-ladder"><span>Choisis ta quantité</span>
          <div>${PACKS.map(k => `<button class="${s.qty === k.min ? 'active' : ''}" data-qty="${k.min}" ${k.min > room ? 'disabled' : ''}><b>×${k.min}</b><small>${euro(k.price)}</small></button>`).join('')}</div>
        </div>
        <div class="pm-buy">
          <div class="qty"><button data-act="dec" aria-label="Moins">−</button><span>${s.qty}</span><button data-act="inc" aria-label="Plus" ${!PACKS.some(p => p.min > s.qty && p.min <= room) ? 'disabled' : ''}>+</button></div>
          <button class="btn btn-cta" data-act="add">Ajouter au panier · ${euro(delta)}</button>
          <button class="icon-btn pm-wish ${state.wish.has(p.id) ? 'on' : ''}" data-act="wish" aria-label="Favoris">${ICON.heart}</button>
        </div>
        ${n ? `<p class="pm-hint">${esc(packHint())}</p>` : ''}
        <ul class="pm-perks"><li>Livraison offerte en 3 jours</li><li>Satisfait ou remboursé 30 jours</li><li>Paiement sécurisé : CB, PayPal, Apple Pay</li></ul>
        <div class="pm-acc">
          <details><summary>Livraison et retours</summary><p>Expédition le jour même avant 14 h, livraison offerte en 3 jours. Retour possible sous 30 jours, remboursement sous 5 jours ouvrés.</p></details>
          <details><summary>Entretien</summary><p>Chiffon humide et savon doux, séchage à l'air libre. Évite la machine à laver, le sèche-cheveux et le soleil direct.</p></details>
          <details><summary>Sécurité</summary><p>Mousse certifiée EN71, sans phtalates, testée en laboratoire. Dès 3 ans.</p></details>
        </div>
        <div class="pm-revs"><h4>Ce qu'en disent nos clients</h4>
          ${shown.map(r => `<figure><div class="review-stars">${'★'.repeat(r.stars)}</div><blockquote>${esc(r.text)}</blockquote><figcaption>${esc(r.name)} · ${esc(r.meta)} <span class="ver">Achat vérifié</span></figcaption></figure>`).join('')}
        </div>
      </div>
      ${related.length ? `<div class="pm-related"><h4>Ils vont bien ensemble</h4><div>${related.map(r => `<button data-open="${r.id}">${img(r)}<span>${esc(r.name)}</span><small>${euro(r.price)}</small></button>`).join('')}</div></div>` : ''}`;
  }
  pm.addEventListener('click', e => {
    if (e.target === pm) { closeModals(); return; }
    if (!pmState) return;
    const ph = e.target.closest('[data-photo]');
    if (ph) { pmState.photo = +ph.dataset.photo; renderProductModal(); return; }
    const op = e.target.closest('[data-open]');
    if (op) { openProduct(op.dataset.open); pm.scrollTop = 0; $('.modal-card', pm).scrollTop = 0; return; }
    const q = e.target.closest('[data-qty]');
    if (q) { pmState.qty = +q.dataset.qty; renderProductModal(); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'inc') { const k = PACKS.find(p => p.min > pmState.qty); if (k && k.min <= Math.max(1, MAX_ITEMS - cartCount())) pmState.qty = k.min; }
    if (a === 'dec') { const k = [...PACKS].reverse().find(p => p.min < pmState.qty); pmState.qty = k ? k.min : 1; }
    if (a === 'add') { addToCart(pmState.id, pmState.qty, true); closeModals(); openDrawer('cart'); return; }
    if (a === 'wish') { toggleWish(pmState.id); return; }
    renderProductModal();
  });
  function closeModals() {
    $$('.modal.open').forEach(m => { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); });
    pmState = null;
    unlockIfNone();
  }
  $$('[data-close]').forEach(b => b.addEventListener('click', () => { closeModals(); closeDrawer(); }));
  overlay.addEventListener('click', () => { closeModals(); closeDrawer(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeModals(); closeDrawer(); search.classList.remove('open'); $('#nav').classList.remove('open'); } });

  /* ---------- Avis ---------- */
  $('#reviewGrid').innerHTML = REVIEWS.slice(0, 6).map(r => {
    const p = byId[r.product];
    return `<figure class="review reveal">
      <div class="review-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
      <blockquote>${esc(r.text)}</blockquote>
      <figcaption>${p ? img(p) : ''}<span><b>${esc(r.name)}</b><small>${esc(r.meta)}${p ? ` · ${esc(p.name)}` : ''}</small></span></figcaption>
    </figure>`;
  }).join('');

  /* ---------- FAQ ---------- */
  $('#faqList').innerHTML = FAQ.map((f, i) => `<details class="faq-item" ${i === 0 ? 'open' : ''}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');

  /* ---------- Newsletter ---------- */
  $('#nlForm').addEventListener('submit', e => {
    e.preventDefault();
    const inp = $('#nlEmail');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(inp.value.trim())) { inp.classList.add('error'); inp.focus(); return; }
    $('#nlForm').hidden = true; $('#nlSuccess').hidden = false;
  });
  $('#nlEmail').addEventListener('input', e => e.target.classList.remove('error'));

  /* ---------- Apparition au scroll ---------- */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -8% 0px' }) : null;
  $$('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('in'));

  /* ---------- Init ---------- */
  renderTabs();
  renderGrid();
  updateBadges();
  renderPackbar();
})();
