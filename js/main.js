/* ============================================================
   COOKIE CORNER — Customer Page Logic
   ============================================================ */

// ── Push ───────────────────────────────────────────────────
const VAPID_PUBLIC_KEY = 'BKz1QWSrmbb0pzlmbh6PFCWf-H8oKpV2odDKEANj3e6Xr4zTIOLveOvAy-t5DnGjzUslp6VcHj0E87vqd1FiAHM'; // replace after running: npx web-push generate-vapid-keys

// ── State ──────────────────────────────────────────────────
let selectedCookieId   = null;
let selectedCookieName = '';
let selectedSize       = 'standard';
let selectedRating     = 0;
let availableCookies   = [];
let batchOpen          = true;
let countdownInterval  = null;

const RATING_LABELS = ['', 'Terrible 😬', 'Not great 😕', 'Pretty good 🙂', 'Loved it 😍', 'Life-changing 🤩'];
const STATUS_LABELS = { pending: 'Pending', confirmed: 'Confirmed', ready: 'Ready for pickup!', done: 'Picked up' };

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  registerSW();
  await loadBatchSettings();
  loadCookies();
  loadAllReviews();
});

// ── Batch / Order window ───────────────────────────────────
async function loadBatchSettings() {
  try {
    const { data, error } = await supabaseClient
      .from('batch_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error || !data || !data.active || !data.deadline) return;

    const deadline = new Date(data.deadline);
    if (deadline <= new Date()) { batchOpen = false; return; }

    // Check order cap (50 active orders max)
    const { count } = await supabaseClient
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'confirmed', 'ready']);
    if (count >= 50) { batchOpen = false; return; }

    // Show floating countdown banner
    document.getElementById('deadline-banner-msg').textContent =
      data.label || 'Last chance to order!';
    document.getElementById('deadline-banner').classList.remove('hidden');
    startCountdown(deadline);
    initNotifyBtn();
  } catch {
    // Table not yet created — keep defaults
  }
}

function startCountdown(deadline) {
  document.getElementById('deadline-banner-close').addEventListener('click', () => {
    document.getElementById('deadline-banner').classList.add('hidden');
    clearInterval(countdownInterval);
  }, { once: true });

  if (countdownInterval) clearInterval(countdownInterval);

  function tick() {
    const diff = deadline - new Date();
    if (diff <= 0) {
      clearInterval(countdownInterval);
      document.getElementById('deadline-banner')?.classList.add('hidden');
      batchOpen = false;
      loadCookies();
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('cd-days').textContent  = String(d).padStart(2, '0');
    document.getElementById('cd-hours').textContent = String(h).padStart(2, '0');
    document.getElementById('cd-mins').textContent  = String(m).padStart(2, '0');
    document.getElementById('cd-secs').textContent  = String(s).padStart(2, '0');
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

// ── Push Notifications ─────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64  = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribeToPush() {
  const reg        = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission-denied');

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const { keys } = sub.toJSON();
  const { error } = await supabaseClient.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
}

async function initNotifyBtn() {
  const btn = document.getElementById('deadline-notify-btn');
  if (!btn) return;

  // Only show in the installed PWA, not in the browser
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    btn.remove();
    return;
  }

  if (!('Notification' in window) || !('PushManager' in window)) {
    btn.remove();
    return;
  }

  if (Notification.permission === 'denied') {
    btn.textContent = '🔔 Enable in phone settings';
    btn.disabled    = true;
    return;
  }

  if (Notification.permission === 'granted') {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    if (sub) { btn.textContent = '✓ Notifications on'; btn.disabled = true; return; }
  }

  btn.addEventListener('click', async () => {
    btn.disabled    = true;
    btn.textContent = 'Enabling…';
    try {
      await subscribeToPush();
      btn.textContent = '✓ Notifications on';
    } catch (err) {
      if (err.message === 'permission-denied') {
        btn.textContent = '🔔 Enable in phone settings';
      } else {
        btn.disabled    = false;
        btn.textContent = '🔔 Notify me';
        showToast('Error: ' + (err.message || String(err)), 'error');
      }
    }
  });
}

// ── Load & Render Cookies ──────────────────────────────────
function showGridError(msg) {
  const grid = document.getElementById('cookies-grid');
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px 20px">
      <div style="font-size:2.2rem;margin-bottom:14px">😕</div>
      <p style="color:var(--text-500);margin-bottom:6px">${msg}</p>
      <p style="color:var(--text-300);font-size:.82rem;margin-bottom:20px">
        Check the browser console (F12) for details.
      </p>
      <button onclick="loadCookies()" class="btn btn-secondary">Try again</button>
    </div>`;
}

async function loadCookies() {
  const grid       = document.getElementById('cookies-grid');
  const emptyState = document.getElementById('empty-state');

  grid.innerHTML = '<div class="loading-spinner"></div>';
  emptyState.classList.add('hidden');

  let cookies, cookieError;
  try {
    // 10-second timeout so the spinner never hangs forever
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('Request timed out after 10 s')), 10000)
    );
    const result = await Promise.race([
      supabaseClient.from('cookies').select('*').eq('available', true).order('name'),
      timeout,
    ]);
    cookies     = result.data;
    cookieError = result.error;
  } catch (e) {
    console.error('loadCookies error:', e);
    showGridError('Could not reach the database. Check your Supabase URL and key in js/config.js.');
    return;
  }

  if (cookieError) {
    console.error('Supabase cookies error:', cookieError);
    showGridError(
      cookieError.code === '42P01'
        ? 'Table "cookies" not found — did you run supabase-setup.sql yet?'
        : 'Could not load cookies: ' + cookieError.message
    );
    return;
  }

  if (!cookies || cookies.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  // Fetch all reviews for the visible cookies in one query
  const cookieIds = cookies.map(c => c.id);
  const { data: reviews } = await supabaseClient
    .from('reviews')
    .select('*')
    .in('cookie_id', cookieIds)
    .order('created_at', { ascending: false });

  // Group reviews by cookie_id
  const byId = {};
  cookieIds.forEach(id => { byId[id] = []; });
  (reviews || []).forEach(r => { if (byId[r.cookie_id]) byId[r.cookie_id].push(r); });

  availableCookies = cookies;
  grid.innerHTML = cookies.map(c => renderCookieCard(c, byId[c.id])).join('');
  attachCardListeners();
}

function renderCookieCard(cookie, reviews) {
  const count = reviews.length;
  const avg   = count > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;

  const ratingHtml = count > 0
    ? `<div class="rating-display">
         <span class="stars-display">${starsHtml(avg)}</span>
         <span class="rating-count">${count} review${count !== 1 ? 's' : ''}</span>
       </div>`
    : '<p class="no-reviews">No reviews yet.</p>';

  const initial = esc(cookie.name.charAt(0).toUpperCase());
  const visual  = cookie.image_url
    ? `<img src="${esc(cookie.image_url)}" alt="${esc(cookie.name)}" class="cookie-card-img">`
    : `<span class="cookie-initial">${initial}</span>`;

  return `
    <div class="cookie-card" data-id="${cookie.id}">
      <div class="cookie-card-header">
        ${visual}
      </div>
      <div class="cookie-card-body">
        <h3>${esc(cookie.name)}</h3>
        ${cookie.description ? `<p class="cookie-description">${esc(cookie.description)}</p>` : ''}
        ${ratingHtml}
      </div>
      <div class="cookie-card-actions">
        ${batchOpen ? `<button class="btn btn-primary order-btn"
          data-cookie-id="${cookie.id}"
          data-cookie-name="${esc(cookie.name)}">Order</button>` : ''}
        <button class="btn btn-secondary review-card-btn"
          data-cookie-id="${cookie.id}"
          data-cookie-name="${esc(cookie.name)}">Review</button>
      </div>
    </div>`;
}

function attachCardListeners() {
  document.querySelectorAll('.order-btn').forEach(btn =>
    btn.addEventListener('click', () => openOrderModal(btn.dataset.cookieId, btn.dataset.cookieName))
  );
  document.querySelectorAll('.review-card-btn').forEach(btn =>
    btn.addEventListener('click', () => openReviewModal(btn.dataset.cookieId, btn.dataset.cookieName))
  );
}

// ── Order Modal ────────────────────────────────────────────
function openOrderModal(cookieId, cookieName) {
  selectedCookieId   = cookieId;
  selectedCookieName = cookieName;

  document.getElementById('selected-cookie-display').textContent = cookieName;
  document.getElementById('order-form-view').classList.remove('hidden');
  document.getElementById('order-success-view').classList.add('hidden');
  document.getElementById('order-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Reset form state
  document.getElementById('order-form').reset();
  document.getElementById('cookie-amount').value = 6;
  selectedSize = 'standard';
  document.querySelectorAll('.size-btn').forEach(b => b.classList.toggle('active', b.dataset.size === 'standard'));
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('close-order-modal').addEventListener('click', closeOrderModal);
document.getElementById('order-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('order-modal')) closeOrderModal();
});
document.getElementById('order-success-close').addEventListener('click', closeOrderModal);

document.getElementById('copy-order-code').addEventListener('click', () => {
  const code = document.getElementById('order-code-display').textContent;
  if (!code) return;
  const btn = document.getElementById('copy-order-code');
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => showToast('Your code: ' + code, 'info', 6000));
});

// Size toggle
document.querySelectorAll('.size-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    selectedSize = btn.dataset.size;
    document.querySelectorAll('.size-btn').forEach(b => b.classList.toggle('active', b === btn));
  })
);

// Amount stepper
document.getElementById('decrease-amount').addEventListener('click', () => {
  const el = document.getElementById('cookie-amount');
  el.value = Math.max(1, parseInt(el.value || 1) - 1);
});
document.getElementById('increase-amount').addEventListener('click', () => {
  const el = document.getElementById('cookie-amount');
  el.value = Math.min(50, parseInt(el.value || 0) + 1);
});

// Order form submit
document.getElementById('order-form').addEventListener('submit', async e => {
  e.preventDefault();

  const name   = document.getElementById('customer-name').value.trim();
  const amount = parseInt(document.getElementById('cookie-amount').value);
  const note   = document.getElementById('order-note').value.trim();
  const btn    = document.getElementById('order-submit-btn');

  if (!name)        { showToast('Please enter your name 🙂', 'error'); return; }
  if (amount < 1)   { showToast('Please enter a valid amount', 'error'); return; }
  if (amount > 50)  { showToast('Maximum order quantity is 50.', 'error'); return; }
  if (!batchOpen) {
    showToast('Orders are currently closed. Check back later!', 'error');
    closeOrderModal();
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Placing order…';

  // Server-side cap check (race condition guard)
  const { count: activeCount } = await supabaseClient
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'confirmed', 'ready']);
  if (activeCount >= 50) {
    showToast('Sorry, this batch is now full (50 orders max). No more orders can be placed.', 'error', 5500);
    btn.disabled = false; btn.textContent = 'Place Order 🍪';
    batchOpen = false;
    closeOrderModal();
    loadCookies();
    return;
  }

  const orderCode = generateOrderCode();

  const { error } = await supabaseClient.from('orders').insert({
    customer_name: name,
    cookie_id:     selectedCookieId,
    cookie_name:   selectedCookieName,
    size:          selectedSize,
    amount:        amount,
    note:          note || null,
    status:        'pending',
    lookup_code:   orderCode,
  });

  btn.disabled    = false;
  btn.textContent = 'Place Order 🍪';

  if (error) {
    showToast('Could not place order. Please try again.', 'error');
    return;
  }

  // Show success view
  document.getElementById('order-code-display').textContent = orderCode;
  document.getElementById('order-form-view').classList.add('hidden');
  const summary = document.getElementById('order-summary-details');
  summary.innerHTML = [
    ['Cookie',  selectedCookieName],
    ['Size',    selectedSize === 'small' ? 'Mini 🫐' : 'Standard 🍪'],
    ['Amount',  `${amount} piece${amount !== 1 ? 's' : ''}`],
    ['Name',    name],
    note ? ['Note', note] : null,
  ].filter(Boolean).map(([k, v]) =>
    `<div class="order-summary-row"><span>${k}</span><span>${esc(v)}</span></div>`
  ).join('');
  document.getElementById('order-success-view').classList.remove('hidden');
});

// ── All Reviews Section ────────────────────────────────────
async function loadAllReviews() {
  const grid = document.getElementById('reviews-grid');
  grid.innerHTML = '<div class="loading-spinner"></div>';

  let reviews, error;
  try {
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('Request timed out after 10 s')), 10000)
    );
    const result = await Promise.race([
      supabaseClient.from('reviews').select('*, cookies(name)').order('created_at', { ascending: false }),
      timeout,
    ]);
    reviews = result.data;
    error   = result.error;
  } catch (e) {
    console.error('loadAllReviews error:', e);
    grid.innerHTML = '<p class="reviews-empty">Could not load reviews. Check your connection and try again.</p>';
    return;
  }

  if (error) {
    grid.innerHTML = '<p class="reviews-empty">Could not load reviews.</p>';
    return;
  }

  if (!reviews || reviews.length === 0) {
    grid.innerHTML = '<p class="reviews-empty">No reviews yet — be the first! 🍪</p>';
    return;
  }

  grid.innerHTML = reviews.map(renderReviewCard).join('');
}

function renderReviewCard(r) {
  const cookieName = r.cookies?.name || '';
  const stars      = starsHtml(r.rating);
  return `
    <div class="review-card">
      <div class="review-card-stars">${stars}</div>
      ${r.comment ? `<p class="review-card-comment">${esc(r.comment)}</p>` : ''}
      <div class="review-card-meta">
        <span class="review-card-name">${esc(r.reviewer_name)}</span>
        <span class="review-card-sep">·</span>
        <span class="review-card-cookie">${esc(cookieName)}</span>
        <span class="review-card-date">${fmtDate(r.created_at)}</span>
      </div>
    </div>`;
}

document.getElementById('write-review-btn').addEventListener('click', () => {
  openReviewModal(null, null);
});

// ── Review Modal ───────────────────────────────────────────
function openReviewModal(cookieId, cookieName) {
  selectedCookieId   = cookieId || null;
  selectedCookieName = cookieName || '';
  selectedRating     = 0;

  const forRow      = document.getElementById('review-for-row');
  const cookieGroup = document.getElementById('review-cookie-group');
  const select      = document.getElementById('review-cookie-select');

  if (cookieId) {
    document.getElementById('review-cookie-name').textContent = cookieName;
    forRow.style.display      = '';
    cookieGroup.style.display = 'none';
  } else {
    forRow.style.display      = 'none';
    cookieGroup.style.display = '';
    select.innerHTML = '<option value="">Select a cookie…</option>' +
      availableCookies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }

  document.getElementById('review-form').reset();
  updateStars();
  document.getElementById('review-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeReviewModal() {
  document.getElementById('review-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('close-review-modal').addEventListener('click', closeReviewModal);
document.getElementById('review-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('review-modal')) closeReviewModal();
});

// Star interactions
document.querySelectorAll('.star').forEach(star => {
  star.addEventListener('click', () => {
    selectedRating = parseInt(star.dataset.value);
    updateStars();
    document.getElementById('rating-hint').textContent = `— ${RATING_LABELS[selectedRating]}`;
  });
  star.addEventListener('mouseenter', () => {
    const v = parseInt(star.dataset.value);
    document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('hovered', i < v));
  });
  star.addEventListener('mouseleave', () => {
    document.querySelectorAll('.star').forEach(s => s.classList.remove('hovered'));
  });
});

function updateStars() {
  document.querySelectorAll('.star').forEach((s, i) =>
    s.classList.toggle('active', i < selectedRating)
  );
}

// Review form submit
document.getElementById('review-form').addEventListener('submit', async e => {
  e.preventDefault();

  const name    = document.getElementById('reviewer-name').value.trim();
  const comment = document.getElementById('review-comment').value.trim();
  const btn     = document.getElementById('review-submit-btn');

  if (!name)          { showToast('Please enter your name 🙂', 'error'); return; }
  if (!selectedRating){ showToast('Please select a rating ⭐', 'error'); return; }

  const nameErr    = validateReviewText(name);
  const commentErr = validateReviewText(comment);
  if (nameErr)    { showToast(nameErr, 'error', 5000); return; }
  if (commentErr) { showToast(commentErr, 'error', 5000); return; }

  // Resolve cookie from select when opened from the reviews section
  if (!selectedCookieId) {
    const select = document.getElementById('review-cookie-select');
    selectedCookieId   = select.value;
    selectedCookieName = select.options[select.selectedIndex]?.text || '';
    if (!selectedCookieId) { showToast('Please select a cookie 🍪', 'error'); return; }
  }

  btn.disabled    = true;
  btn.textContent = 'Submitting…';

  const { error } = await supabaseClient.from('reviews').insert({
    cookie_id:      selectedCookieId,
    reviewer_name:  name,
    rating:         selectedRating,
    comment:        comment || null,
  });

  btn.disabled    = false;
  btn.textContent = 'Submit Review 💚';

  if (error) {
    showToast('Could not submit review. Please try again.', 'error');
    return;
  }

  closeReviewModal();
  showToast('Review submitted! Thank you 💚', 'success');
  await Promise.all([loadCookies(), loadAllReviews()]);
});

// ── Status Modal ───────────────────────────────────────────
function openStatusModal() {
  document.getElementById('status-code').value = '';
  document.getElementById('status-results').innerHTML = '';
  document.getElementById('status-results').classList.add('hidden');
  document.getElementById('status-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeStatusModal() {
  document.getElementById('status-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('close-status-modal').addEventListener('click', closeStatusModal);
document.getElementById('status-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('status-modal')) closeStatusModal();
});

document.getElementById('track-order-btn').addEventListener('click', e => {
  e.preventDefault();
  openStatusModal();
});
document.getElementById('track-order-btn-mobile').addEventListener('click', e => {
  e.preventDefault();
  openStatusModal();
});

document.getElementById('status-form').addEventListener('submit', async e => {
  e.preventDefault();
  const code = document.getElementById('status-code').value.trim().toUpperCase();
  const btn  = document.getElementById('status-submit-btn');
  if (!code) { showToast('Enter your order code 🙂', 'error'); return; }

  btn.disabled    = true;
  btn.textContent = 'Looking up…';

  const { data: orders, error } = await supabaseClient
    .rpc('get_order_by_code', { p_code: code });

  btn.disabled    = false;
  btn.textContent = 'Check Status';

  const results = document.getElementById('status-results');
  results.classList.remove('hidden');

  if (error || !orders || orders.length === 0) {
    results.innerHTML = `<p class="status-empty">No order found for code <strong>${esc(code)}</strong>. Double-check the code from your confirmation.</p>`;
    return;
  }

  results.innerHTML = orders.map(o => `
    <div class="status-order-card">
      <div class="status-order-left">
        <span class="status-order-name">${esc(o.cookie_name)}</span>
        <span class="status-order-detail">${o.amount} × ${o.size === 'small' ? 'Mini' : 'Standard'}</span>
      </div>
      <span class="status-badge status-${o.status}">${STATUS_LABELS[o.status] || o.status}</span>
    </div>
  `).join('');
});

// ── Helpers ────────────────────────────────────────────────
function generateOrderCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function starsHtml(avg) {
  const filled = Math.round(avg);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDeadline(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
    + ' at ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function showToast(msg, type = 'info', duration = 3500) {
  const c     = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className   = `toast toast-${type}`;
  toast.textContent = msg;
  c.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('toast-visible')));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 320);
  }, duration);
}
