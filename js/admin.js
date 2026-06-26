/* ============================================================
   COOKIE CORNER — Admin Dashboard Logic
   ============================================================ */

// ── State ──────────────────────────────────────────────────
let allOrders    = [];
let allReviews   = [];
let activeFilter = 'all';
let pendingDeleteId   = null;
let pendingDeleteType = null;
let batchSettings     = { active: false, deadline: null, label: null };
let allCookies        = [];
let editOrderSize     = 'standard';

// ── Auth ───────────────────────────────────────────────────
async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    showDashboard(session.user.email);
  } else {
    showLogin();
  }
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session) showDashboard(session.user.email);
  else         showLogin();
});

function showLogin() {
  document.getElementById('login-screen').style.display  = 'flex';
  document.getElementById('admin-layout').classList.remove('active');
}

function showDashboard(email) {
  document.getElementById('login-screen').style.display  = 'none';
  document.getElementById('admin-layout').classList.add('active');
  document.getElementById('admin-user-email').textContent = email;
  initDashboard();
}

// Login form
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errEl.style.display = 'none';
  btn.disabled        = true;
  btn.textContent     = 'Signing in…';

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  btn.disabled    = false;
  btn.textContent = 'Sign In';

  if (error) {
    errEl.textContent   = error.message || 'Login failed. Check your credentials.';
    errEl.style.display = 'block';
  }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
});

// ── Dashboard Init ─────────────────────────────────────────
async function initDashboard() {
  await Promise.all([loadOrders(), loadCookiesAdmin(), loadReviewsAdmin(), loadBatchSettings()]);
  subscribeToOrders();
}

// ── Tabs ───────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  })
);

// Close any open status dropdown when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.status-dd.open').forEach(dd => dd.classList.remove('open'));
});

function statusLabel(s) {
  return { pending: 'Pending', confirmed: 'Confirmed', ready: 'Ready', done: 'Done' }[s] || s;
}

// ── Orders ─────────────────────────────────────────────────
async function loadOrders() {
  const { data, error } = await supabaseClient
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { showToast('Could not load orders.', 'error'); return; }

  allOrders = data || [];
  renderOrders();
  updateStats();
}

function renderOrders() {
  const tbody = document.getElementById('orders-tbody');
  const visible = activeFilter === 'all'
    ? allOrders
    : allOrders.filter(o => o.status === activeFilter);

  if (visible.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">
      ${activeFilter === 'all' ? 'No orders yet — they\'ll appear here in real-time.' : `No ${activeFilter} orders.`}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = visible.map(o => `
    <tr data-order-id="${o.id}">
      <td data-label="Customer">
        <div class="order-name">${esc(o.customer_name)}</div>
        ${o.note ? `<div class="order-note">"${esc(o.note)}"</div>` : ''}
      </td>
      <td data-label="Cookie">${esc(o.cookie_name)}</td>
      <td data-label="Size"><span class="size-pill">${o.size === 'small' ? 'Mini 🫐' : 'Standard 🍪'}</span></td>
      <td data-label="Qty"><strong>${o.amount}</strong></td>
      <td data-label="Time"><div class="order-time">${fmtDateTime(o.created_at)}</div></td>
      <td data-label="Status">
        <div class="status-dd" data-order-id="${o.id}" data-status="${o.status}">
          <button class="status-dd-trigger" type="button">
            <span class="status-icon status-icon--${o.status}"></span>
            <span class="status-dd-label">${statusLabel(o.status)}</span>
            <span class="status-dd-caret">▾</span>
          </button>
          <div class="status-dd-menu">
            ${['pending','confirmed','ready','done'].map(s => `
              <button class="status-dd-item${s === o.status ? ' current' : ''}" data-value="${s}" type="button">
                <span class="status-icon status-icon--${s}"></span>
                <span>${statusLabel(s)}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </td>
      <td data-label="">
        <div class="order-row-actions">
          <button class="edit-order-btn" data-order-id="${o.id}" title="Edit order">Edit</button>
          <button class="delete-order-btn" data-order-id="${o.id}" title="Delete order"><span class="delete-icon"></span></button>
        </div>
      </td>
    </tr>
  `).join('');

  // Status dropdowns
  tbody.querySelectorAll('.status-dd').forEach(dd => {
    dd.querySelector('.status-dd-trigger').addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.status-dd.open').forEach(o => { if (o !== dd) o.classList.remove('open'); });
      if (!dd.classList.contains('open')) {
        const rect = e.currentTarget.getBoundingClientRect();
        const menu = dd.querySelector('.status-dd-menu');
        menu.style.top  = (rect.bottom + 6) + 'px';
        menu.style.left = rect.left + 'px';
      }
      dd.classList.toggle('open');
    });
    dd.querySelectorAll('.status-dd-item').forEach(item => {
      item.addEventListener('click', () => {
        const newStatus = item.dataset.value;
        dd.querySelector('.status-icon').className = `status-icon status-icon--${newStatus}`;
        dd.querySelector('.status-dd-label').textContent = statusLabel(newStatus);
        dd.querySelectorAll('.status-dd-item').forEach(i => i.classList.toggle('current', i === item));
        dd.dataset.status = newStatus;
        dd.classList.remove('open');
        updateOrderStatus(dd.dataset.orderId, newStatus);
      });
    });
  });

  // Edit buttons
  tbody.querySelectorAll('.edit-order-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const order = allOrders.find(o => o.id === btn.dataset.orderId);
      if (order) openEditModal(order);
    })
  );

  // Delete buttons
  tbody.querySelectorAll('.delete-order-btn').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete('order', btn.dataset.orderId, 'Delete this order?'))
  );
}

async function updateOrderStatus(orderId, status) {
  const { error } = await supabaseClient
    .from('orders')
    .update({ status })
    .eq('id', orderId);

  if (error) { showToast('Could not update status.', 'error'); return; }

  const order = allOrders.find(o => o.id === orderId);
  if (order) order.status = status;
  updateStats();
}

function updateStats() {
  const total   = allOrders.length;
  const pending = allOrders.filter(o => o.status === 'pending').length;
  const ready   = allOrders.filter(o => o.status === 'ready').length;
  const done    = allOrders.filter(o => o.status === 'done').length;
  const cookies = allOrders
    .filter(o => o.status !== 'done')
    .reduce((sum, o) => sum + (o.amount || 0), 0);

  document.getElementById('stat-total').textContent   = total;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-ready').textContent   = ready;
  document.getElementById('stat-done').textContent    = done;
  document.getElementById('stat-cookies').textContent = cookies;

  document.getElementById('pending-badge').textContent = pending;
  document.getElementById('pending-badge').className   = 'tab-badge' + (pending > 0 ? ' urgent' : '');
}

// Real-time subscription
function subscribeToOrders() {
  supabaseClient.channel('orders-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
      allOrders.unshift(payload.new);
      renderOrders();
      updateStats();
      showToast(`New order from ${payload.new.customer_name}! 🍪`, 'success');
      highlightNewRow(payload.new.id);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, payload => {
      const idx = allOrders.findIndex(o => o.id === payload.new.id);
      if (idx > -1) allOrders[idx] = payload.new;
      renderOrders();
      updateStats();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, payload => {
      allOrders = allOrders.filter(o => o.id !== payload.old.id);
      renderOrders();
      updateStats();
    })
    .subscribe();
}

function highlightNewRow(orderId) {
  const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
  if (row) { row.classList.add('new-row'); setTimeout(() => row.classList.remove('new-row'), 2100); }
}

// Filters
document.querySelectorAll('.filter-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderOrders();
  })
);

// ── Cookies Admin ──────────────────────────────────────────
async function loadCookiesAdmin() {
  const grid = document.getElementById('cookies-manage-grid');

  const { data: cookies, error } = await supabaseClient
    .from('cookies')
    .select('*')
    .order('name');

  if (error) { showToast('Could not load cookies.', 'error'); grid.innerHTML = ''; return; }

  allCookies = cookies || [];
  document.getElementById('cookies-count-badge').textContent = allCookies.length;

  if (!cookies || cookies.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-300);font-size:.9rem">No cookies yet. Add one below!</p>';
    return;
  }

  grid.innerHTML = cookies.map(c => `
    <div class="manage-card ${c.available ? '' : 'unavailable'}" data-cookie-id="${c.id}">
      <div class="manage-thumb">
        ${c.image_url
          ? `<img src="${esc(c.image_url)}" alt="${esc(c.name)}">`
          : `<span>${esc(c.name.charAt(0).toUpperCase())}</span>`}
      </div>
      <div class="manage-info">
        <h4>${esc(c.name)}</h4>
        <p>${c.description ? esc(c.description) : '(no description)'}</p>
      </div>
      <div class="manage-actions">
        <button class="toggle-btn ${c.available ? 'on' : ''}"
          data-cookie-id="${c.id}"
          data-available="${c.available}"
          title="${c.available ? 'Click to hide' : 'Click to show'}">
        </button>
        <button class="delete-order-btn" data-cookie-id="${c.id}" data-type="cookie" title="Delete cookie"><span class="delete-icon"></span></button>
      </div>
    </div>
  `).join('');

  // Toggle availability
  grid.querySelectorAll('.toggle-btn').forEach(btn =>
    btn.addEventListener('click', () => toggleCookieAvailability(btn.dataset.cookieId, btn.dataset.available === 'true'))
  );

  // Delete cookie
  grid.querySelectorAll('[data-type="cookie"]').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete('cookie', btn.dataset.cookieId, 'Delete this cookie? All reviews tied to it will also be removed.'))
  );
}

async function toggleCookieAvailability(cookieId, currentlyAvailable) {
  const { error } = await supabaseClient
    .from('cookies')
    .update({ available: !currentlyAvailable })
    .eq('id', cookieId);

  if (error) { showToast('Could not update cookie.', 'error'); return; }
  showToast(currentlyAvailable ? 'Cookie hidden from customers.' : 'Cookie is now visible!', 'success');
  await loadCookiesAdmin();
}

// Add cookie form
document.getElementById('add-cookie-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('new-cookie-name').value.trim();
  const desc = document.getElementById('new-cookie-desc').value.trim();
  const file = document.getElementById('new-cookie-image').files[0];
  const btn  = document.getElementById('add-cookie-btn');

  if (!name) { showToast('Please enter a cookie name.', 'error'); return; }

  btn.disabled    = true;
  btn.textContent = 'Adding…';

  let image_url = null;
  if (file) {
    const ext  = file.name.split('.').pop();
    const path = `${Date.now()}.${ext}`;
    const { data: up, error: upErr } = await supabaseClient.storage
      .from('cookie-images')
      .upload(path, file, { upsert: true });
    if (upErr) {
      showToast('Image upload failed. Try again.', 'error');
      btn.disabled = false; btn.textContent = 'Add Cookie';
      return;
    }
    const { data: { publicUrl } } = supabaseClient.storage
      .from('cookie-images')
      .getPublicUrl(up.path);
    image_url = publicUrl;
  }

  const { error } = await supabaseClient.from('cookies').insert({
    name,
    description: desc || null,
    image_url,
    available: true,
  });

  btn.disabled    = false;
  btn.textContent = 'Add Cookie';

  if (error) { showToast('Could not add cookie. Try again.', 'error'); return; }

  document.getElementById('add-cookie-form').reset();
  document.getElementById('new-image-preview').style.display = 'none';
  showToast(`"${name}" added!`, 'success');
  await loadCookiesAdmin();
});

// Image preview
document.getElementById('new-cookie-image').addEventListener('change', e => {
  const file    = e.target.files[0];
  const preview = document.getElementById('new-image-preview');
  const img     = document.getElementById('new-image-preview-img');
  if (file) {
    img.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
});

// ── Reviews Admin ──────────────────────────────────────────
async function loadReviewsAdmin() {
  const { data, error } = await supabaseClient
    .from('reviews')
    .select('*, cookies(name)')
    .order('created_at', { ascending: false });

  if (error) { showToast('Could not load reviews.', 'error'); return; }

  allReviews = data || [];
  document.getElementById('reviews-count-badge').textContent = allReviews.length;
  renderReviewsAdmin();
}

function renderReviewsAdmin() {
  const tbody = document.getElementById('reviews-tbody');

  if (allReviews.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No reviews yet.</td></tr>`;
    return;
  }

  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  tbody.innerHTML = allReviews.map(r => `
    <tr data-review-id="${r.id}">
      <td data-label="Reviewer"><div class="order-name">${esc(r.reviewer_name)}</div></td>
      <td data-label="Cookie">${esc(r.cookies?.name || '—')}</td>
      <td data-label="Rating" style="color:#d4a843;letter-spacing:1px;font-size:.95rem">${stars(r.rating)}</td>
      <td data-label="Comment" style="max-width:320px;color:var(--text-500);font-size:.88rem;font-style:italic">
        ${r.comment ? esc(r.comment) : '<span style="color:var(--text-200)">—</span>'}
      </td>
      <td data-label="Date"><div class="order-time">${fmtDateTime(r.created_at)}</div></td>
      <td data-label="">
        <button class="delete-order-btn delete-review-btn" data-review-id="${r.id}" title="Delete review"><span class="delete-icon"></span></button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.delete-review-btn').forEach(btn =>
    btn.addEventListener('click', () =>
      confirmDelete('review', btn.dataset.reviewId, 'Delete this review? This cannot be undone.')
    )
  );
}

// ── Edit Order Modal ───────────────────────────────────────
function openEditModal(order) {
  editOrderSize = order.size;
  document.getElementById('edit-order-id').value      = order.id;
  document.getElementById('edit-customer-name').value = order.customer_name;
  document.getElementById('edit-amount').value        = order.amount;
  document.getElementById('edit-note').value          = order.note || '';

  const sel = document.getElementById('edit-cookie-select');
  sel.innerHTML = allCookies.length
    ? allCookies.map(c =>
        `<option value="${c.id}"${c.id === order.cookie_id ? ' selected' : ''}>${esc(c.name)}</option>`
      ).join('')
    : `<option value="${order.cookie_id}">${esc(order.cookie_name)}</option>`;

  document.querySelectorAll('.edit-size-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.size === order.size)
  );

  document.getElementById('edit-order-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-order-modal').classList.add('hidden');
}

document.getElementById('close-edit-order-modal').addEventListener('click', closeEditModal);
document.getElementById('edit-order-cancel').addEventListener('click', closeEditModal);
document.getElementById('edit-order-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-order-modal')) closeEditModal();
});

document.querySelectorAll('.edit-size-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    editOrderSize = btn.dataset.size;
    document.querySelectorAll('.edit-size-btn').forEach(b => b.classList.toggle('active', b === btn));
  })
);

document.getElementById('edit-decrease-amount').addEventListener('click', () => {
  const el = document.getElementById('edit-amount');
  el.value = Math.max(1, parseInt(el.value || 1) - 1);
});
document.getElementById('edit-increase-amount').addEventListener('click', () => {
  const el = document.getElementById('edit-amount');
  el.value = parseInt(el.value || 0) + 1;
});

document.getElementById('edit-order-form').addEventListener('submit', async e => {
  e.preventDefault();
  const orderId    = document.getElementById('edit-order-id').value;
  const name       = document.getElementById('edit-customer-name').value.trim();
  const amount     = parseInt(document.getElementById('edit-amount').value);
  const note       = document.getElementById('edit-note').value.trim();
  const sel        = document.getElementById('edit-cookie-select');
  const cookieId   = sel.value;
  const cookieName = sel.options[sel.selectedIndex]?.text || '';
  const btn        = document.getElementById('edit-order-save');

  if (!name || !cookieId || amount < 1) { showToast('Please fill in all required fields.', 'error'); return; }

  btn.disabled = true; btn.textContent = 'Saving…';

  const { error } = await supabaseClient.from('orders').update({
    customer_name: name,
    cookie_id:     cookieId,
    cookie_name:   cookieName,
    size:          editOrderSize,
    amount,
    note:          note || null,
  }).eq('id', orderId);

  btn.disabled = false; btn.textContent = 'Save changes';

  if (error) { showToast('Could not save changes.', 'error'); return; }

  const idx = allOrders.findIndex(o => o.id === orderId);
  if (idx > -1) {
    allOrders[idx] = { ...allOrders[idx], customer_name: name, cookie_id: cookieId, cookie_name: cookieName, size: editOrderSize, amount, note: note || null };
  }

  renderOrders();
  closeEditModal();
  showToast('Order updated!', 'success');
});

// ── Delete confirmation modal ──────────────────────────────
function confirmDelete(type, id, message) {
  pendingDeleteType = type;
  pendingDeleteId   = id;
  const titles = { order: 'Delete Order?', cookie: 'Delete Cookie?', review: 'Delete Review?' };
  document.getElementById('confirm-title').textContent = titles[type] || 'Delete?';
  document.getElementById('confirm-msg').textContent   = message || 'This cannot be undone.';
  document.getElementById('confirm-modal').classList.remove('hidden');
}

document.getElementById('confirm-cancel').addEventListener('click', () => {
  document.getElementById('confirm-modal').classList.add('hidden');
  pendingDeleteId = null; pendingDeleteType = null;
});
document.getElementById('confirm-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('confirm-modal')) {
    document.getElementById('confirm-modal').classList.add('hidden');
    pendingDeleteId = null; pendingDeleteType = null;
  }
});

document.getElementById('confirm-ok').addEventListener('click', async () => {
  document.getElementById('confirm-modal').classList.add('hidden');
  if (!pendingDeleteId) return;

  if (pendingDeleteType === 'order') {
    const { error } = await supabaseClient.from('orders').delete().eq('id', pendingDeleteId);
    if (error) { showToast('Could not delete order.', 'error'); return; }
    allOrders = allOrders.filter(o => o.id !== pendingDeleteId);
    renderOrders();
    updateStats();
    showToast('Order deleted.', 'info');
  }

  if (pendingDeleteType === 'cookie') {
    const { error } = await supabaseClient.from('cookies').delete().eq('id', pendingDeleteId);
    if (error) { showToast('Could not delete cookie.', 'error'); return; }
    showToast('Cookie deleted.', 'info');
    await loadCookiesAdmin();
  }

  if (pendingDeleteType === 'review') {
    const { error } = await supabaseClient.from('reviews').delete().eq('id', pendingDeleteId);
    if (error) { showToast('Could not delete review.', 'error'); return; }
    allReviews = allReviews.filter(r => r.id !== pendingDeleteId);
    document.getElementById('reviews-count-badge').textContent = allReviews.length;
    renderReviewsAdmin();
    showToast('Review deleted.', 'info');
  }

  pendingDeleteId = null; pendingDeleteType = null;
});

// ── CSV Export ─────────────────────────────────────────────
document.getElementById('export-csv-btn').addEventListener('click', () => {
  const rows = activeFilter === 'all'
    ? allOrders
    : allOrders.filter(o => o.status === activeFilter);

  if (rows.length === 0) { showToast('No orders to export.', 'info'); return; }

  const headers = ['Name', 'Cookie', 'Size', 'Amount', 'Status', 'Note', 'Time'];
  const data = rows.map(o => [
    o.customer_name,
    o.cookie_name,
    o.size === 'small' ? 'Mini' : 'Standard',
    o.amount,
    o.status,
    o.note || '',
    fmtDateTime(o.created_at),
  ]);

  const csv = [headers, ...data]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `cookie-orders-${activeFilter}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Exported ${rows.length} order${rows.length !== 1 ? 's' : ''}.`, 'success');
});

// ── Helpers ────────────────────────────────────────────────
function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
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

// ── Batch / Order window ───────────────────────────────────
async function loadBatchSettings() {
  const { data } = await supabaseClient
    .from('batch_settings')
    .select('*')
    .eq('id', 1)
    .single();

  batchSettings = data || { active: false, deadline: null, label: null };
  renderBatchCard();
}

function renderBatchCard() {
  const toggle = document.getElementById('batch-toggle');
  const dot    = document.getElementById('batch-status-dot');
  const lbl    = document.getElementById('batch-status-label');

  const isOpen = !!batchSettings.active;
  toggle.classList.toggle('on', isOpen);
  dot.classList.toggle('open', isOpen);
  lbl.textContent = isOpen ? 'Orders Open' : 'Orders Closed';

  if (batchSettings.deadline) {
    const d = new Date(batchSettings.deadline);
    document.getElementById('batch-deadline').value =
      new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  } else {
    document.getElementById('batch-deadline').value = '';
  }
  document.getElementById('batch-label').value = batchSettings.label || '';
}

document.getElementById('batch-toggle').addEventListener('click', async () => {
  const newActive = !document.getElementById('batch-toggle').classList.contains('on');
  const { error } = await supabaseClient.from('batch_settings').upsert({
    id: 1, active: newActive,
    deadline: batchSettings.deadline,
    label: batchSettings.label,
  });
  if (error) { showToast('Could not update order window.', 'error'); return; }
  batchSettings.active = newActive;
  renderBatchCard();
  showToast(newActive ? 'Orders are now open! 🟢' : 'Orders are now closed. 🔴', newActive ? 'success' : 'info');
});

async function sendPushNotification(title, body) {
  const { data, error } = await supabaseClient.functions.invoke('send-push', {
    body: { title, body, url: 'https://jg-md.github.io/homemade-cookies/' },
  });
  if (error) throw error;
  return data;
}

document.getElementById('batch-save-btn').addEventListener('click', async () => {
  const deadlineVal = document.getElementById('batch-deadline').value;
  const labelVal    = document.getElementById('batch-label').value.trim();
  const btn         = document.getElementById('batch-save-btn');

  btn.disabled = true; btn.textContent = 'Saving…';

  const newDeadline = deadlineVal ? new Date(deadlineVal).toISOString() : null;
  const { error } = await supabaseClient.from('batch_settings').upsert({
    id: 1,
    active: batchSettings.active,
    deadline: newDeadline,
    label: labelVal || null,
  });

  btn.disabled = false; btn.textContent = 'Save';
  if (error) { showToast('Could not save settings.', 'error'); return; }

  batchSettings.deadline = newDeadline;
  batchSettings.label    = labelVal || null;
  showToast('Batch settings saved!', 'success');

  // Notify subscribers when a new deadline is set and ordering is active
  if (newDeadline && batchSettings.active) {
    const msg = labelVal || 'A new batch is open — order your cookies now!';
    sendPushNotification('🍪 Cookie Corner — New Batch!', msg);
  }
});

document.getElementById('batch-remind-btn').addEventListener('click', async () => {
  const btn = document.getElementById('batch-remind-btn');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const msg  = batchSettings.label || 'Don\'t forget to place your cookie order!';
    const data = await sendPushNotification('🍪 Cookie Corner — Reminder', msg);
    showToast(`Reminder sent to ${data?.sent ?? '?'} subscriber(s).`, 'success');
  } catch (err) {
    showToast('Failed: ' + (err.message || JSON.stringify(err)), 'error');
  }
  btn.disabled = false; btn.textContent = 'Send Reminder';
});

// ── Boot ───────────────────────────────────────────────────
checkAuth();
