/* ============================================================
   COOKIE CORNER — Customer Page Logic
   ============================================================ */

// ── State ──────────────────────────────────────────────────
let selectedCookieId   = null;
let selectedCookieName = '';
let selectedSize       = 'standard';
let selectedRating     = 0;
let availableCookies   = [];

const RATING_LABELS = ['', 'Terrible 😬', 'Not great 😕', 'Pretty good 🙂', 'Loved it 😍', 'Life-changing 🤩'];

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadCookies();
  loadAllReviews();
});

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
        <button class="btn btn-primary btn-full order-btn"
          data-cookie-id="${cookie.id}"
          data-cookie-name="${esc(cookie.name)}">Order</button>
      </div>
    </div>`;
}

function attachCardListeners() {
  document.querySelectorAll('.order-btn').forEach(btn =>
    btn.addEventListener('click', () => openOrderModal(btn.dataset.cookieId, btn.dataset.cookieName))
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
  el.value = parseInt(el.value || 0) + 1;
});

// Order form submit
document.getElementById('order-form').addEventListener('submit', async e => {
  e.preventDefault();

  const name   = document.getElementById('customer-name').value.trim();
  const amount = parseInt(document.getElementById('cookie-amount').value);
  const note   = document.getElementById('order-note').value.trim();
  const btn    = document.getElementById('order-submit-btn');

  if (!name)     { showToast('Please enter your name 🙂', 'error'); return; }
  if (amount < 1) { showToast('Please enter a valid amount', 'error'); return; }

  btn.disabled    = true;
  btn.textContent = 'Placing order…';

  const { error } = await supabaseClient.from('orders').insert({
    customer_name: name,
    cookie_id:     selectedCookieId,
    cookie_name:   selectedCookieName,
    size:          selectedSize,
    amount:        amount,
    note:          note || null,
    status:        'pending',
  });

  btn.disabled    = false;
  btn.textContent = 'Place Order 🍪';

  if (error) {
    showToast('Could not place order. Please try again.', 'error');
    return;
  }

  // Show success view
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

  const { data: reviews, error } = await supabaseClient
    .from('reviews')
    .select('*, cookies(name)')
    .order('created_at', { ascending: false });

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

// ── Helpers ────────────────────────────────────────────────
function starsHtml(avg) {
  const filled = Math.round(avg);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
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
