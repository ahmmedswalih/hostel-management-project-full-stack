// ============================================================
// Grand Lumière Hotel Management — Frontend
// Vanilla JS SPA. Reads API base from config.js.
// ============================================================

const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE)
  || 'http://localhost:5000/api';
const REFRESH_INTERVAL_MS = (window.APP_CONFIG && window.APP_CONFIG.REFRESH_INTERVAL_MS) ?? 30000;
const DEFAULT_PAGE = (window.APP_CONFIG && window.APP_CONFIG.DEFAULT_PAGE) || 'home';

// ─── In-memory cache (refreshed on each page visit) ─────────
let cache = {
  guests: [], rooms: [], bookings: [], payments: [],
  feedback: [], maintenance: [], history: [], cancellations: []
};

// ─── UTILS ───────────────────────────────────────────────────

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

function nightsCount(ci, co) {
  return Math.max(0, Math.round((new Date(co) - new Date(ci)) / 86400000));
}

function dateOnly(v) {
  if (!v) return '—';
  return String(v).split('T')[0];
}

function starsHTML(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// XSS-safe escaping for any string we drop into innerHTML.
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusBadge(s) {
  const map = {
    'Available': 'green', 'Occupied': 'red', 'Maintenance': 'amber', 'Reserved': 'blue',
    'Confirmed': 'blue', 'Checked In': 'green', 'Checked Out': 'gold',
    'Cancelled': 'red', 'No Show': 'amber',
    'Completed': 'green', 'Pending': 'amber', 'Failed': 'red', 'Refunded': 'blue',
    'In Progress': 'blue', 'Resolved': 'green',
    'Aadhaar': 'gold', 'Passport': 'blue', 'Driving License': 'green',
    'Voter ID': 'amber', 'PAN Card': 'gold',
  };
  return `<span class="badge badge-${map[s] || 'gold'}">${esc(s)}</span>`;
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showToast(msg, type = 'default') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.originalLabel) btn.dataset.originalLabel = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Please wait…';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalLabel || btn.textContent;
  }
}

function emptyRow(cols, msg = 'No records found') {
  return `<tr><td colspan="${cols}" style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">${esc(msg)}</td></tr>`;
}

function loadingRow(cols) {
  return `<tr class="loading-row"><td colspan="${cols}"><span class="spinner"></span> Loading…</td></tr>`;
}

// Debounce — wait `ms` of idle time before invoking `fn` (e.g. for search inputs)
function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ─── API HELPER ───────────────────────────────────────────────

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  let json = null;
  try { json = await res.json(); } catch (_) { /* non-JSON response */ }
  if (!res.ok) {
    const message = (json && json.message) || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json || {};
}

const GET    = (path)       => api('GET',    path);
const POST   = (path, body) => api('POST',   path, body);
const PUT    = (path, body) => api('PUT',    path, body);
const PATCH  = (path, body) => api('PATCH',  path, body);
const DELETE = (path)       => api('DELETE', path);

// ─── API STATUS ───────────────────────────────────────────────

async function checkApiStatus() {
  const dot   = document.getElementById('api-dot');
  const label = document.getElementById('api-label');
  if (!dot || !label) return;
  try {
    await fetch(API_BASE + '/health', { method: 'GET' });
    dot.className = 'api-dot connected';
    label.textContent = 'API Connected';
  } catch {
    dot.className = 'api-dot error';
    label.textContent = 'API Offline';
  }
}

// ─── NAVIGATION ───────────────────────────────────────────────

function navigate(page, el) {
  const pageEl = document.getElementById('page-' + page);
  if (!pageEl) {
    showToast('Unknown page: ' + page, 'error');
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  pageEl.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');

  const titles = {
    home:         'HOME',
    dashboard:    'Dashboard',
    guests:       'Guest Profiles',
    feedback:     'Guest Feedback',
    rooms:        'Room Management',
    maintenance:  'Room Maintenance',
    reservations: 'Reservations',
    bookings:     'Reservations',
    history:      'Booking History',
    cancellations:'Cancellations',
    payments:     'Payments & Billing',
  };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titles[page] || page;
  renderPage(page);
}

function renderPage(page) {
  switch (page) {
    case 'home':         /* static — no load needed */ break;
    case 'dashboard':    renderDashboard();    break;
    case 'guests':       renderGuests();       break;
    case 'feedback':     renderFeedback();     break;
    case 'rooms':        renderRooms();        break;
    case 'maintenance':  renderMaintenance();  break;
    case 'reservations': renderPublicReservations(); break;
    case 'bookings':     renderBookings();     break;
    case 'history':      renderHistory();      break;
    case 'cancellations':renderCancellations();break;
    case 'payments':     renderPayments();     break;
    default: break;
  }
}

// Small helpers for safe DOM updates
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// ─── DASHBOARD ────────────────────────────────────────────────

async function renderDashboard() {
  try {
    const { data } = await GET('/dashboard');

    setText('stat-guests',    data.guests.total);
    setText('stat-available', data.rooms.available);
    setText('stat-bookings',  data.bookings.total);
    setText('stat-revenue',   fmt(data.revenue.total_revenue));

    // Recent bookings
    const bHTML = data.recent_bookings.length
      ? data.recent_bookings.map(b => `<tr>
          <td class="td-name">${esc(b.guest_name)}</td>
          <td>Rm ${esc(b.room_number)}</td>
          <td>${esc(dateOnly(b.check_in))}</td>
          <td>${statusBadge(b.booking_status || 'Confirmed')}</td>
        </tr>`).join('')
      : emptyRow(4, 'No bookings yet');
    setHTML('dashboard-bookings', bHTML);

    // Room occupancy bars
    const statuses = ['Available', 'Occupied', 'Reserved', 'Maintenance'];
    const colors   = { Available: 'var(--green)', Occupied: 'var(--red)', Reserved: 'var(--blue)', Maintenance: 'var(--amber)' };
    const total    = data.rooms.total || 1;
    const counts   = {
      Available: data.rooms.available,
      Occupied:  data.rooms.occupied,
      Reserved:  data.rooms.reserved,
      Maintenance: data.rooms.maintenance,
    };
    setHTML('room-summary', statuses.map(s => {
      const cnt = counts[s] || 0;
      const pct = Math.round((cnt / total) * 100);
      return `<div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px">
          <span style="color:var(--text-secondary)">${esc(s)}</span>
          <span style="color:${colors[s]};font-weight:500">${cnt} room${cnt !== 1 ? 's' : ''}</span>
        </div>
        <div style="height:5px;background:var(--border);border-radius:3px">
          <div style="height:100%;width:${pct}%;background:${colors[s]};border-radius:3px;transition:width 0.7s ease"></div>
        </div>
      </div>`;
    }).join(''));

    // Recent payments
    const pHTML = data.recent_payments.length
      ? data.recent_payments.map(p => `<tr>
          <td class="td-name">${esc(p.guest_name)}</td>
          <td style="color:var(--gold);font-weight:500">${fmt(p.amount)}</td>
          <td>${esc(p.payment_method)}</td>
          <td>${statusBadge(p.status)}</td>
        </tr>`).join('')
      : emptyRow(4);
    setHTML('dashboard-payments', pHTML);

    // Maintenance alerts
    const mHTML = data.pending_maintenance.length
      ? data.pending_maintenance.map(m => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="width:8px;height:8px;border-radius:50%;background:var(--amber);flex-shrink:0;margin-top:4px"></div>
            <div>
              <div style="font-size:13px;color:var(--text-primary);font-weight:500">Room ${esc(m.room_number)} — ${esc(m.issue)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(dateOnly(m.date))} · ${statusBadge(m.status)}</div>
            </div>
          </div>`).join('')
      : '<div class="empty-state"><div class="icon">✓</div><p>No pending maintenance issues</p></div>';
    setHTML('maintenance-alerts', mHTML);

    // Show notif dot if pending maintenance
    const dot = document.getElementById('maint-notif');
    if (dot) dot.style.display = data.pending_maintenance.length ? 'inline-block' : 'none';

  } catch (err) {
    showToast('Could not load dashboard: ' + err.message, 'error');
    console.error(err);
  }
}

// ─── GUESTS ───────────────────────────────────────────────────

let allGuests = [];

async function renderGuests() {
  setHTML('guests-table', loadingRow(7));
  try {
    const { data } = await GET('/guests');
    allGuests = data || [];
    displayGuests(allGuests);
  } catch (err) {
    setHTML('guests-table', emptyRow(7, '⚠ ' + err.message));
    showToast(err.message, 'error');
  }
}

function displayGuests(list) {
  if (!list || !list.length) {
    setHTML('guests-table', emptyRow(7, 'No guests found'));
    return;
  }
  setHTML('guests-table', list.map(g => `<tr>
    <td style="color:var(--text-muted);font-size:12px">${g.guest_id}</td>
    <td class="td-name">${esc(g.name)}</td>
    <td>${esc(g.phone)}</td>
    <td>${esc(g.email || '—')}</td>
    <td>${statusBadge(g.proof_type)}</td>
    <td style="font-size:12px;color:var(--text-muted)">${esc(g.proof_number)}</td>
    <td style="display:flex;gap:5px">
      <button class="btn btn-outline btn-sm" onclick="viewGuest(${g.guest_id})">View</button>
      <button class="btn btn-danger btn-sm" onclick="deleteGuest(${g.guest_id})">Delete</button>
    </td>
  </tr>`).join(''));
}

const debouncedGuestFilter = debounce(() => {
  const q = (document.getElementById('guest-search').value || '').toLowerCase().trim();
  if (!q) return displayGuests(allGuests);
  displayGuests(allGuests.filter(g =>
    (g.name  || '').toLowerCase().includes(q) ||
    (g.email || '').toLowerCase().includes(q) ||
    (g.phone || '').includes(q)
  ));
}, 200);

function filterGuests() {
  debouncedGuestFilter();
}

async function addGuest() {
  const name  = (document.getElementById('g-name').value || '').trim();
  const phone = (document.getElementById('g-phone').value || '').trim();
  if (!name || !phone) { showToast('⚠ Name and phone are required'); return; }
  setLoading('btn-add-guest', true);
  try {
    await POST('/guests', {
      name, phone,
      email:        document.getElementById('g-email').value || undefined,
      address:      document.getElementById('g-address').value || undefined,
      proof_type:   document.getElementById('g-proof-type').value,
      proof_number: document.getElementById('g-proof-no').value,
    });
    closeModal('modal-add-guest');
    ['g-name','g-phone','g-email','g-address','g-proof-no'].forEach(id => document.getElementById(id).value = '');
    await renderGuests();
    showToast('✓ Guest registered', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('btn-add-guest', false);
  }
}

async function deleteGuest(id) {
  if (!confirm('Delete this guest profile? This cannot be undone.')) return;
  try {
    await DELETE('/guests/' + id);
    await renderGuests();
    showToast('Guest removed');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function viewGuest(id) {
  try {
    const [{ data: g }, { data: bookings }] = await Promise.all([
      GET('/guests/' + id),
      GET('/guests/' + id + '/bookings'),
    ]);
    document.getElementById('guest-detail-title').textContent = g.name;
    document.getElementById('guest-detail-body').innerHTML = `
      <div class="detail-list">
        <div class="detail-row"><span class="detail-key">Phone</span><span class="detail-val">${esc(g.phone)}</span></div>
        <div class="detail-row"><span class="detail-key">Email</span><span class="detail-val">${esc(g.email || '—')}</span></div>
        <div class="detail-row"><span class="detail-key">Address</span><span class="detail-val">${esc(g.address || '—')}</span></div>
        <div class="detail-row"><span class="detail-key">Proof Type</span><span class="detail-val">${statusBadge(g.proof_type)}</span></div>
        <div class="detail-row"><span class="detail-key">Proof No.</span><span class="detail-val">${esc(g.proof_number)}</span></div>
        <div class="detail-row"><span class="detail-key">Total Bookings</span><span class="detail-val">${bookings.length}</span></div>
      </div>
      ${bookings.length ? `<div class="divider"></div>
        <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:10px;letter-spacing:1px;text-transform:uppercase;font-weight:500">Booking History</div>
        ${bookings.map(b => `
          <div style="padding:9px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--text-secondary);display:flex;justify-content:space-between;align-items:center">
            <span>Room ${esc(b.room_number)} · ${esc(dateOnly(b.check_in))} → ${esc(dateOnly(b.check_out))} · ${b.nights} night(s)</span>
            <span>${statusBadge(b.booking_status || 'Confirmed')}</span>
          </div>`).join('')}` : ''}
    `;
    openModal('modal-guest-detail');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── FEEDBACK ─────────────────────────────────────────────────

async function renderFeedback() {
  setHTML('feedback-table', loadingRow(5));
  try {
    const { data } = await GET('/guests/feedback/all');
    const list = data || [];
    setHTML('feedback-table', list.length
      ? list.map(f => `<tr>
          <td style="color:var(--text-muted);font-size:12px">${f.feedback_id}</td>
          <td class="td-name">${esc(f.guest_name)}</td>
          <td><span class="stars">${starsHTML(Number(f.rating) || 0)}</span></td>
          <td style="font-size:12.5px;color:var(--text-muted);max-width:280px">${esc(f.comment || '—')}</td>
          <td style="font-size:12px">${esc(dateOnly(f.created_at))}</td>
        </tr>`).join('')
      : emptyRow(5, 'No feedback yet'));

    // Populate guest select (only if the form is in the DOM)
    const sel = document.getElementById('fb-guest');
    if (sel) {
      const { data: guests } = await GET('/guests');
      sel.innerHTML = (guests || []).map(g => `<option value="${g.guest_id}">${esc(g.name)}</option>`).join('');
    }
  } catch (err) {
    setHTML('feedback-table', emptyRow(5, '⚠ ' + err.message));
  }
}

async function addFeedback() {
  setLoading('btn-add-feedback', true);
  try {
    await POST('/guests/feedback', {
      guest_id: parseInt(document.getElementById('fb-guest').value, 10),
      rating:   parseInt(document.getElementById('fb-rating').value, 10),
      comment:  document.getElementById('fb-comment').value || undefined,
    });
    closeModal('modal-add-feedback');
    document.getElementById('fb-comment').value = '';
    await renderFeedback();
    showToast('✓ Feedback recorded', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('btn-add-feedback', false);
  }
}

// ─── ROOMS ────────────────────────────────────────────────────

async function renderRooms() {
  try {
    const { data: rooms } = await GET('/rooms');
    cache.rooms = rooms || [];

    // Grid
    setHTML('rooms-grid', cache.rooms.map(r => `
      <div class="room-card status-${esc((r.status || '').toLowerCase().replace(' ', '-'))}" onclick="viewRoom(${r.room_id})">
        <div class="room-type-label">${esc(r.room_type)}</div>
        <div class="room-number">${esc(r.room_number)}</div>
        <div style="margin-top:6px">${statusBadge(r.status)}</div>
        <div class="room-price">${fmt(r.price)} / night</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Floor ${esc(r.floor || '—')}</div>
      </div>`).join('') || '<div class="empty-state"><p>No rooms added yet</p></div>');

    // List
    setHTML('rooms-table', cache.rooms.length
      ? cache.rooms.map(r => `<tr>
          <td class="td-name">${esc(r.room_number)}</td>
          <td>${esc(r.room_type)}</td>
          <td>${esc(r.floor || '—')}</td>
          <td style="color:var(--gold);font-weight:500">${fmt(r.price)}</td>
          <td>${statusBadge(r.status)}</td>
          <td style="display:flex;gap:5px">
            <button class="btn btn-outline btn-sm" onclick="changeRoomStatus(${r.room_id}, '${esc(r.status)}')">Change Status</button>
            <button class="btn btn-danger btn-sm" onclick="deleteRoom(${r.room_id})">Delete</button>
          </td>
        </tr>`).join('')
      : emptyRow(6));

    // Facilities
    setHTML('facilities-table', cache.rooms.map(r => `<tr>
      <td class="td-name">${esc(r.room_number)}</td>
      <td>${esc(r.room_type)}</td>
      <td style="font-size:12.5px;color:var(--text-muted)">${esc((r.facilities || []).join(', ') || '—')}</td>
    </tr>`).join(''));

    // Populate maintenance modal room select
    const sel = document.getElementById('m-room');
    if (sel) sel.innerHTML = cache.rooms.map(r => `<option value="${r.room_id}">Room ${esc(r.room_number)} (${esc(r.room_type)})</option>`).join('');

  } catch (err) {
    showToast('Could not load rooms: ' + err.message, 'error');
  }
}

async function addRoom() {
  const num = (document.getElementById('r-num').value || '').trim();
  if (!num) { showToast('⚠ Room number required'); return; }
  setLoading('btn-add-room', true);
  try {
    const facStr = document.getElementById('r-facilities').value;
    const facilities = facStr ? facStr.split(',').map(f => f.trim()).filter(Boolean) : [];
    await POST('/rooms', {
      room_number: num,
      room_type:   document.getElementById('r-type').value,
      price:       parseFloat(document.getElementById('r-price').value) || 0,
      status:      document.getElementById('r-status').value,
      floor:       parseInt(document.getElementById('r-floor').value, 10) || 1,
      facilities,
    });
    closeModal('modal-add-room');
    ['r-num','r-floor','r-price','r-facilities'].forEach(id => document.getElementById(id).value = '');
    await renderRooms();
    showToast('✓ Room added', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('btn-add-room', false);
  }
}

async function deleteRoom(id) {
  if (!confirm('Delete this room?')) return;
  try {
    await DELETE('/rooms/' + id);
    await renderRooms();
    showToast('Room deleted');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function changeRoomStatus(id, current) {
  const statuses = ['Available', 'Occupied', 'Reserved', 'Maintenance'];
  const next = statuses[(statuses.indexOf(current) + 1) % statuses.length];
  if (!confirm(`Change room status to "${next}"?`)) return;
  try {
    await PATCH('/rooms/' + id + '/status', { status: next });
    await renderRooms();
    showToast(`Room → ${next}`);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function viewRoom(id) {
  try {
    const { data: r } = await GET('/rooms/' + id);
    document.getElementById('room-detail-title').textContent = `Room ${r.room_number} — ${r.room_type}`;
    document.getElementById('room-detail-body').innerHTML = `
      <div class="detail-list">
        <div class="detail-row"><span class="detail-key">Status</span><span class="detail-val">${statusBadge(r.status)}</span></div>
        <div class="detail-row"><span class="detail-key">Price / Night</span><span class="detail-val" style="color:var(--gold);font-weight:500">${fmt(r.price)}</span></div>
        <div class="detail-row"><span class="detail-key">Floor</span><span class="detail-val">${esc(r.floor || '—')}</span></div>
        <div class="detail-row"><span class="detail-key">Facilities</span><span class="detail-val" style="font-size:12.5px">${esc((r.facilities || []).map(f => f.facility).join(', ') || '—')}</span></div>
      </div>
      ${r.maintenance?.length ? `
        <div class="divider"></div>
        <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;font-weight:500">Maintenance Log</div>
        ${r.maintenance.map(m => `
          <div style="padding:9px 0;border-bottom:1px solid var(--border);font-size:13px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="color:var(--text-primary);font-weight:500">${esc(m.issue)}</span>
              ${statusBadge(m.status)}
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${esc(dateOnly(m.date))}</div>
          </div>`).join('')}` : ''}
    `;
    openModal('modal-room-detail');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function switchRoomTab(tab, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('room-tab-' + tab).classList.add('active');
}

// ─── MAINTENANCE ──────────────────────────────────────────────

async function renderMaintenance() {
  setHTML('maintenance-table', loadingRow(6));
  try {
    const { data } = await GET('/rooms/maintenance/all');
    if (!cache.rooms || cache.rooms.length === 0) {
      const { data: rooms } = await GET('/rooms');
      cache.rooms = rooms || [];
    }
    const sel = document.getElementById('m-room');
    if (sel && cache.rooms.length) {
      sel.innerHTML = cache.rooms.map(r => `<option value="${r.room_id}">Room ${esc(r.room_number)} (${esc(r.room_type)})</option>`).join('');
    }
    const dateEl = document.getElementById('m-date');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

    const list = data || [];
    setHTML('maintenance-table', list.length
      ? list.map(m => `<tr>
          <td style="color:var(--text-muted);font-size:12px">${m.maintenance_id}</td>
          <td class="td-name">Room ${esc(m.room_number)}</td>
          <td style="font-size:12.5px;max-width:220px">${esc(m.issue)}</td>
          <td style="font-size:12px">${esc(dateOnly(m.date))}</td>
          <td>${statusBadge(m.status)}</td>
          <td style="display:flex;gap:5px">
            ${m.status !== 'Resolved' ? `<button class="btn btn-success btn-sm" onclick="resolveMaintenance(${m.maintenance_id})">Resolve</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="deleteMaintenance(${m.maintenance_id})">Delete</button>
          </td>
        </tr>`).join('')
      : emptyRow(6, 'No maintenance records'));
  } catch (err) {
    setHTML('maintenance-table', emptyRow(6, '⚠ ' + err.message));
  }
}

async function addMaintenance() {
  const issue = (document.getElementById('m-issue').value || '').trim();
  if (!issue) { showToast('⚠ Issue description required'); return; }
  setLoading('btn-add-maint', true);
  try {
    await POST('/rooms/maintenance', {
      room_id: parseInt(document.getElementById('m-room').value, 10),
      issue,
      date:    document.getElementById('m-date').value,
      status:  document.getElementById('m-status').value,
    });
    closeModal('modal-add-maintenance');
    document.getElementById('m-issue').value = '';
    await renderMaintenance();
    showToast('✓ Issue logged', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('btn-add-maint', false);
  }
}

async function resolveMaintenance(id) {
  try {
    await PATCH('/rooms/maintenance/' + id + '/resolve', {});
    await renderMaintenance();
    showToast('✓ Issue resolved', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteMaintenance(id) {
  if (!confirm('Delete this maintenance record?')) return;
  try {
    await DELETE('/rooms/maintenance/' + id);
    await renderMaintenance();
    showToast('Record deleted');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── BOOKINGS (admin) ─────────────────────────────────────────

async function populateBookingModal() {
  try {
    // One round trip for everything: all rooms (we'll filter client-side)
    const { data: allRooms } = await GET('/rooms');
    const { data: guests }   = await GET('/guests');

    document.getElementById('b-guest').innerHTML =
      (guests || []).map(g => `<option value="${g.guest_id}">${esc(g.name)}</option>`).join('');

    const bookable = (allRooms || []).filter(r => r.status === 'Available' || r.status === 'Reserved');
    document.getElementById('b-room').innerHTML =
      bookable.map(r => `<option value="${r.room_id}" data-price="${r.price}">Room ${esc(r.room_number)} — ${esc(r.room_type)} (${fmt(r.price)}/night)</option>`).join('');

    document.getElementById('b-checkin').value  = new Date().toISOString().split('T')[0];
    document.getElementById('b-checkout').value = '';
    document.getElementById('booking-price-preview').style.display = 'none';
  } catch (err) {
    showToast('Could not load booking form data', 'error');
  }
}

async function renderBookings() {
  setHTML('bookings-table', loadingRow(8));
  try {
    const { data } = await GET('/bookings');
    cache.bookings = data || [];
    setHTML('bookings-table', cache.bookings.length
      ? cache.bookings.map(b => `<tr>
          <td style="color:var(--text-muted);font-size:12px">#${b.booking_id}</td>
          <td class="td-name">${esc(b.guest_name)}</td>
          <td>Rm ${esc(b.room_number)}</td>
          <td>${esc(dateOnly(b.check_in))}</td>
          <td>${esc(dateOnly(b.check_out))}</td>
          <td style="text-align:center">${b.nights}</td>
          <td>${statusBadge(b.booking_status || 'Confirmed')}</td>
          <td style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn btn-success btn-sm" onclick="checkIn(${b.booking_id})">In</button>
            <button class="btn btn-outline btn-sm" onclick="checkOut(${b.booking_id})">Out</button>
            <button class="btn btn-danger btn-sm" onclick="quickCancel(${b.booking_id})">✕</button>
          </td>
        </tr>`).join('')
      : emptyRow(8, 'No bookings found'));
  } catch (err) {
    setHTML('bookings-table', emptyRow(8, '⚠ ' + err.message));
  }
}

function previewBookingPrice() {
  const sel = document.getElementById('b-room');
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.dataset.price) { showToast('⚠ Pick a room first'); return; }
  const ci = document.getElementById('b-checkin').value;
  const co = document.getElementById('b-checkout').value;
  if (!ci || !co) { showToast('⚠ Enter both dates'); return; }
  const nights = nightsCount(ci, co);
  if (nights <= 0) { showToast('⚠ Check-out must be after check-in'); return; }
  const price = Number(opt.dataset.price);
  document.getElementById('booking-price-text').textContent =
    `${nights} night(s) × ${fmt(price)} = Total: ${fmt(nights * price)}`;
  document.getElementById('booking-price-preview').style.display = 'block';
}

async function addBooking() {
  const ci = document.getElementById('b-checkin').value;
  const co = document.getElementById('b-checkout').value;
  if (!ci || !co) { showToast('⚠ Dates required'); return; }
  if (nightsCount(ci, co) <= 0) { showToast('⚠ Invalid dates'); return; }
  setLoading('btn-add-booking', true);
  try {
    const { data } = await POST('/bookings', {
      guest_id:        parseInt(document.getElementById('b-guest').value, 10),
      room_id:         parseInt(document.getElementById('b-room').value, 10),
      check_in:        ci,
      check_out:       co,
      adults:          parseInt(document.getElementById('b-adults').value, 10) || 1,
      children:        parseInt(document.getElementById('b-children').value, 10) || 0,
      special_requests: document.getElementById('b-requests').value || undefined,
    });
    closeModal('modal-add-booking');
    document.getElementById('b-requests').value = '';
    await renderBookings();
    showToast(`✓ Booking confirmed — ${fmt(data.total_amount)} total`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('btn-add-booking', false);
  }
}

async function checkIn(id) {
  try {
    await PATCH('/bookings/' + id + '/checkin', {});
    await renderBookings();
    showToast('✓ Guest checked in', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

async function checkOut(id) {
  try {
    await PATCH('/bookings/' + id + '/checkout', {});
    await renderBookings();
    showToast('✓ Guest checked out', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

async function quickCancel(id) {
  if (!confirm('Cancel this booking?')) return;
  try {
    await POST('/bookings/cancellations', {
      booking_id:   id,
      reason:       'Cancelled by staff',
      cancel_date:  new Date().toISOString().split('T')[0],
      refund_amount: 0,
    });
    await renderBookings();
    showToast('Booking cancelled');
  } catch (err) { showToast(err.message, 'error'); }
}

// ─── PUBLIC RESERVATIONS PAGE (page-reservations) ─────────────

async function renderPublicReservations() {
  // Populate the room dropdown once
  try {
    const sel = document.getElementById('r-room-select');
    if (sel && sel.options.length <= 1) {
      const { data: rooms } = await GET('/rooms');
      const bookable = (rooms || []).filter(r => r.status === 'Available' || r.status === 'Reserved');
      sel.innerHTML = '<option value="">Select a room…</option>' +
        bookable.map(r => `<option value="${r.room_id}" data-price="${r.price}">Room ${esc(r.room_number)} — ${esc(r.room_type)} (${fmt(r.price)}/night)</option>`).join('');
    }
    const ci = document.getElementById('r-checkin');
    if (ci && !ci.value) ci.value = new Date().toISOString().split('T')[0];

    // Show the list of recent bookings
    const tbody = document.getElementById('public-reservations-table');
    const { data: bookings } = await GET('/bookings');
    const list = (bookings || []).slice(0, 10);
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No bookings yet — be the first!</td></tr>';
    } else {
      tbody.innerHTML = list.map(b => `<tr>
        <td style="color:var(--text-muted)">#${b.booking_id}</td>
        <td class="td-name">${esc(b.guest_name)}</td>
        <td>Rm ${esc(b.room_number)}</td>
        <td>${esc(dateOnly(b.check_in))}</td>
        <td>${esc(dateOnly(b.check_out))}</td>
        <td>${statusBadge(b.booking_status || 'Confirmed')}</td>
      </tr>`).join('');
    }
  } catch (err) {
    showToast('Could not load reservations: ' + err.message, 'error');
  }
}

function previewPublicPrice() {
  const sel = document.getElementById('r-room-select');
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.dataset.price) return;
  const ci = document.getElementById('r-checkin').value;
  const co = document.getElementById('r-checkout').value;
  if (!ci || !co) return;
  const nights = nightsCount(ci, co);
  if (nights <= 0) return;
  const price = Number(opt.dataset.price);
  document.getElementById('public-price-text').textContent =
    `${nights} night(s) × ${fmt(price)} = Total: ${fmt(nights * price)}`;
  document.getElementById('public-price-preview').style.display = 'block';
}

async function submitPublicBooking() {
  const name    = (document.getElementById('r-name').value    || '').trim();
  const phone   = (document.getElementById('r-phone').value   || '').trim();
  const email   = (document.getElementById('r-email').value   || '').trim();
  const proofType = document.getElementById('r-proof-type').value;
  const proofNo   = (document.getElementById('r-proof-no').value || '').trim();
  const roomId  = document.getElementById('r-room-select').value;
  const ci      = document.getElementById('r-checkin').value;
  const co      = document.getElementById('r-checkout').value;
  const adults  = parseInt(document.getElementById('r-adults').value, 10) || 1;
  const children= parseInt(document.getElementById('r-children').value, 10) || 0;
  const requests= document.getElementById('r-requests').value || '';

  if (!name || !phone || !proofNo || !roomId || !ci || !co) {
    showToast('⚠ Please fill in name, phone, proof, room and dates', 'error');
    return;
  }
  if (nightsCount(ci, co) <= 0) {
    showToast('⚠ Check-out must be after check-in', 'error');
    return;
  }

  setLoading('btn-public-book', true);
  try {
    // 1) Create or reuse the guest
    const { data: guest } = await POST('/guests', {
      name, phone,
      email: email || undefined,
      proof_type:   proofType,
      proof_number: proofNo,
    });
    // 2) Create the booking
    await POST('/bookings', {
      guest_id: guest.guest_id,
      room_id:  parseInt(roomId, 10),
      check_in: ci,
      check_out: co,
      adults, children,
      special_requests: requests || undefined,
    });
    showToast('✓ Booking confirmed!', 'success');
    // Clear form
    ['r-name','r-phone','r-email','r-proof-no','r-requests'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('public-price-preview').style.display = 'none';
    await renderPublicReservations();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('btn-public-book', false);
  }
}

// ─── HISTORY ──────────────────────────────────────────────────

async function renderHistory() {
  setHTML('history-table', loadingRow(7));
  try {
    const { data } = await GET('/bookings/history/all');
    const list = data || [];
    setHTML('history-table', list.length
      ? list.map(h => `<tr>
          <td style="color:var(--text-muted);font-size:12px">${h.history_id}</td>
          <td>#${h.booking_id}</td>
          <td class="td-name">${esc(h.guest_name)}</td>
          <td>Rm ${esc(h.room_number)}</td>
          <td>${statusBadge(h.status)}</td>
          <td style="font-size:12px">${esc((h.date || '').split('T')[0])}</td>
          <td style="font-size:12px;color:var(--text-muted)">${esc(h.remarks || '—')}</td>
        </tr>`).join('')
      : emptyRow(7, 'No history records'));
  } catch (err) {
    setHTML('history-table', emptyRow(7, '⚠ ' + err.message));
  }
}

// ─── CANCELLATIONS ────────────────────────────────────────────

async function populateCancelModal() {
  try {
    const { data: bookings } = await GET('/bookings');
    document.getElementById('c-booking').innerHTML =
      (bookings || []).map(b => `<option value="${b.booking_id}">#${b.booking_id} — ${esc(b.guest_name)} (Rm ${esc(b.room_number)})</option>`).join('');
    document.getElementById('c-date').value = new Date().toISOString().split('T')[0];
  } catch (err) { /* silent */ }
}

async function renderCancellations() {
  setHTML('cancellations-table', loadingRow(7));
  try {
    const { data } = await GET('/bookings/cancellations/all');
    const list = data || [];
    setHTML('cancellations-table', list.length
      ? list.map(c => `<tr>
          <td style="color:var(--text-muted);font-size:12px">${c.cancel_id}</td>
          <td>#${c.booking_id}</td>
          <td class="td-name">${esc(c.guest_name)}</td>
          <td>Rm ${esc(c.room_number)}</td>
          <td style="font-size:12.5px;max-width:180px;color:var(--text-muted)">${esc(c.reason)}</td>
          <td style="font-size:12px">${esc(dateOnly(c.cancel_date))}</td>
          <td style="color:var(--gold);font-weight:500">${c.refund_amount ? fmt(c.refund_amount) : '—'}</td>
        </tr>`).join('')
      : emptyRow(7, 'No cancellations'));
  } catch (err) {
    setHTML('cancellations-table', emptyRow(7, '⚠ ' + err.message));
  }
}

async function cancelBooking() {
  const reason = (document.getElementById('c-reason').value || '').trim();
  if (!reason) { showToast('⚠ Reason required'); return; }
  setLoading('btn-cancel-booking', true);
  try {
    await POST('/bookings/cancellations', {
      booking_id:    parseInt(document.getElementById('c-booking').value, 10),
      reason,
      cancel_date:   document.getElementById('c-date').value,
      refund_amount: parseFloat(document.getElementById('c-refund').value) || 0,
    });
    closeModal('modal-add-cancel');
    document.getElementById('c-reason').value = '';
    document.getElementById('c-refund').value = '';
    await renderCancellations();
    showToast('✓ Booking cancelled', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('btn-cancel-booking', false);
  }
}

// ─── PAYMENTS ─────────────────────────────────────────────────

async function populatePaymentModal() {
  try {
    const { data: bookings } = await GET('/bookings');
    document.getElementById('p-booking').innerHTML =
      (bookings || []).map(b => `<option value="${b.booking_id}">#${b.booking_id} — ${esc(b.guest_name)} (Rm ${esc(b.room_number)})</option>`).join('');
  } catch (err) { /* silent */ }
}

async function renderPayments() {
  setHTML('payments-table', loadingRow(8));
  try {
    const [{ data: payments }, { data: summary }] = await Promise.all([
      GET('/payments'),
      GET('/payments/summary'),
    ]);

    setText('pay-total',   fmt(summary.total_revenue));
    setText('pay-pending', fmt(summary.pending_amount));
    setText('pay-count',   summary.total_transactions);

    const list = payments || [];
    setHTML('payments-table', list.length
      ? list.map(p => `<tr>
          <td style="color:var(--text-muted);font-size:12px">#${p.payment_id}</td>
          <td>#${p.booking_id}</td>
          <td class="td-name">${esc(p.guest_name)}</td>
          <td style="color:var(--gold);font-weight:600">${fmt(p.amount)}</td>
          <td>${esc(p.payment_method)}</td>
          <td style="font-size:12px">${esc((p.date || '').split('T')[0])}</td>
          <td>${statusBadge(p.status)}</td>
          <td style="display:flex;gap:5px">
            <button class="btn btn-outline btn-sm" onclick="printInvoice(${p.payment_id})">Invoice</button>
            <button class="btn btn-danger btn-sm" onclick="deletePayment(${p.payment_id})">Delete</button>
          </td>
        </tr>`).join('')
      : emptyRow(8, 'No payment records'));

    await populatePaymentModal();
  } catch (err) {
    setHTML('payments-table', emptyRow(8, '⚠ ' + err.message));
  }
}

async function addPayment() {
  const amount = parseFloat(document.getElementById('p-amount').value);
  if (!amount) { showToast('⚠ Amount required'); return; }
  setLoading('btn-add-payment', true);
  try {
    await POST('/payments', {
      booking_id:      parseInt(document.getElementById('p-booking').value, 10),
      amount,
      payment_method:  document.getElementById('p-method').value,
      status:          document.getElementById('p-status').value,
      transaction_ref: document.getElementById('p-ref').value || undefined,
    });
    closeModal('modal-add-payment');
    document.getElementById('p-amount').value = '';
    document.getElementById('p-ref').value    = '';
    await renderPayments();
    showToast('✓ Payment recorded', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('btn-add-payment', false);
  }
}

async function deletePayment(id) {
  if (!confirm('Delete this payment record?')) return;
  try {
    await DELETE('/payments/' + id);
    await renderPayments();
    showToast('Payment deleted');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function printInvoice(pid) {
  try {
    const { data: inv } = await GET('/payments/' + pid + '/invoice');
    const b = inv.booking;
    const g = inv.guest;
    const p = inv.payment;
    const h = inv.hotel;

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${esc(inv.invoice_number)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'DM Sans', sans-serif; max-width: 640px; margin: 48px auto; color: #1a1915; padding: 0 24px; }
      .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:24px; border-bottom:2px solid #e8e6df; }
      .hotel-name { font-family:'Cormorant Garamond',serif; font-size:28px; color:#b8892a; }
      .invoice-no { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#9c9a90; margin-top:4px; }
      .invoice-label { text-align:right; }
      .invoice-label h2 { font-family:'Cormorant Garamond',serif; font-size:22px; font-weight:400; color:#5c5a52; }
      .invoice-label p { font-size:12px; color:#9c9a90; margin-top:4px; }
      .section { margin-bottom:24px; }
      .section-title { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#9c9a90; font-weight:500; margin-bottom:12px; }
      table { width:100%; border-collapse:collapse; font-size:13.5px; }
      td { padding:8px 0; border-bottom:1px solid #f0efe9; vertical-align:top; }
      td:first-child { color:#9c9a90; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; width:40%; }
      td:last-child { color:#1a1915; font-weight:500; }
      tr:last-child td { border-bottom:none; }
      .total-row { background:#fdf8ee; margin:0 -20px; padding:16px 20px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-top:16px; }
      .total-label { font-size:12px; text-transform:uppercase; letter-spacing:1px; color:#9c9a90; }
      .total-amount { font-family:'Cormorant Garamond',serif; font-size:32px; color:#b8892a; }
      .footer { margin-top:40px; padding-top:20px; border-top:1px solid #e8e6df; text-align:center; font-size:12px; color:#9c9a90; }
    </style></head>
    <body>
      <div class="header">
        <div>
          <div class="hotel-name">${esc(h.name)}</div>
          <div class="invoice-no">${esc(h.address)}</div>
          <div class="invoice-no" style="margin-top:2px">${esc(h.phone)} · ${esc(h.email)}</div>
        </div>
        <div class="invoice-label">
          <h2>Invoice</h2>
          <p>${esc(inv.invoice_number)}</p>
          <p style="margin-top:4px">${esc(new Date(inv.generated_at).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}))}</p>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Guest Details</div>
        <table>
          <tr><td>Name</td><td>${esc(g.name)}</td></tr>
          <tr><td>Phone</td><td>${esc(g.phone)}</td></tr>
          ${g.email ? `<tr><td>Email</td><td>${esc(g.email)}</td></tr>` : ''}
          ${g.address ? `<tr><td>Address</td><td>${esc(g.address)}</td></tr>` : ''}
        </table>
      </div>

      <div class="section">
        <div class="section-title">Booking Details</div>
        <table>
          <tr><td>Booking ID</td><td>#${b.booking_id}</td></tr>
          <tr><td>Room</td><td>${esc(b.room_number)} — ${esc(b.room_type)}</td></tr>
          <tr><td>Check-in</td><td>${esc(dateOnly(b.check_in))}</td></tr>
          <tr><td>Check-out</td><td>${esc(dateOnly(b.check_out))}</td></tr>
          <tr><td>Duration</td><td>${b.nights} night(s)</td></tr>
          <tr><td>Guests</td><td>${b.adults} Adult(s), ${b.children} Child(ren)</td></tr>
          <tr><td>Rate / Night</td><td>₹${Number(b.room_price_per_night).toLocaleString('en-IN')}</td></tr>
          <tr><td>Room Total</td><td>₹${Number(b.room_total).toLocaleString('en-IN')}</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Payment Details</div>
        <table>
          <tr><td>Method</td><td>${esc(p.payment_method)}</td></tr>
          <tr><td>Status</td><td>${esc(p.status)}</td></tr>
          ${p.transaction_ref ? `<tr><td>Ref No.</td><td>${esc(p.transaction_ref)}</td></tr>` : ''}
          <tr><td>Date</td><td>${esc(dateOnly(p.payment_date))}</td></tr>
        </table>
        <div class="total-row">
          <div>
            <div class="total-label">Amount Paid</div>
          </div>
          <div class="total-amount">₹${Number(p.amount_paid).toLocaleString('en-IN')}</div>
        </div>
      </div>

      <div class="footer">
        <p>Thank you for choosing ${esc(h.name)}</p>
        <p style="margin-top:4px">GSTIN: ${esc(h.gstin)}</p>
      </div>
      <script>window.onload = () => window.print();<\/script>
    </body></html>`);
  } catch (err) {
    showToast('Could not load invoice: ' + err.message, 'error');
  }
}

// ─── MODAL INIT ───────────────────────────────────────────────

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// When opening certain modals, populate their data first.
const origOpen = openModal;
window.openModal = function(id) {
  origOpen(id);
  if (id === 'modal-add-feedback')    renderFeedback();
  if (id === 'modal-add-maintenance') renderMaintenance();
  if (id === 'modal-add-booking')     populateBookingModal();
  if (id === 'modal-add-cancel')      populateCancelModal();
  if (id === 'modal-add-payment')     populatePaymentModal();
};

// Live price preview on the public booking form
['r-room-select','r-checkin','r-checkout'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', previewPublicPrice);
});
const rci = document.getElementById('r-checkin');
if (rci) rci.addEventListener('change', previewPublicPrice);

// ─── INIT ─────────────────────────────────────────────────────

function updateGreeting() {
  const hour = new Date().getHours();
  let greeting = '', emoji = '';
  if      (hour >= 5  && hour < 12) { greeting = 'Good Morning';   emoji = '🌅'; }
  else if (hour >= 12 && hour < 17) { greeting = 'Good Afternoon'; emoji = '☀️'; }
  else if (hour >= 17 && hour < 21) { greeting = 'Good Evening';   emoji = '🌆'; }
  else                              { greeting = 'Good Night';     emoji = '🌙'; }
  const greetingEl = document.querySelector('#page-dashboard .page-header h1');
  if (greetingEl) greetingEl.textContent = `${emoji} ${greeting}, Manager`;
}

updateGreeting();
setInterval(updateGreeting, 60000);
const dateEl = document.getElementById('current-date');
if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', {
  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
});

// Initial API check, page load, and periodic status refresh
checkApiStatus();
if (REFRESH_INTERVAL_MS > 0) setInterval(checkApiStatus, REFRESH_INTERVAL_MS);

// Open the configured default page on load
const defaultNavEl = document.querySelector(`[data-page="${DEFAULT_PAGE}"]`);
if (defaultNavEl) {
  navigate(DEFAULT_PAGE, defaultNavEl);
} else if (document.querySelector('[data-page="home"]')) {
  navigate('home', document.querySelector('[data-page="home"]'));
} else {
  renderDashboard();
}
