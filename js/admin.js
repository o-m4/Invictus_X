// admin.js — Admin Dashboard with live backend data + polling

const API = 'http://localhost:8000';

function showSection(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
  document.getElementById('section-' + name).style.display = 'block';
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`.sidebar-link[onclick*="${name}"]`)?.classList.add('active');
}

// ── Load overview stats from backend ───────────────────
async function loadOverview() {
  try {
    const res  = await fetch(`${API}/api/admin/overview`);
    const data = await res.json();

    _setEl('stat-total',       data.total        || 0);
    _setEl('stat-resolved',    data.resolved      || 0);
    _setEl('stat-inprog',      data.in_progress   || 0);
    _setEl('stat-escalated',   data.escalated     || 0);
    _setEl('stat-pending',     data.pending       || 0);
    _setEl('stat-proof',       data.proof_submitted || 0);
    _setEl('stat-verified',    (data.ai_summary || []).find(x=>x.ai_verified==='verified')?.cnt || 0);
    _setEl('stat-needsreview', (data.ai_summary || []).find(x=>x.ai_verified==='needs-review')?.cnt || 0);

    // Category bars
    const catList = document.getElementById('catBarList');
    if (catList && data.by_category) {
      const max = Math.max(...data.by_category.map(c=>c.cnt), 1);
      catList.innerHTML = data.by_category.slice(0,6).map(c => `
        <div class="cat-row">
          <span>${c.category}</span>
          <div class="bar-wrap"><div class="bar" style="width:${Math.round(c.cnt/max*100)}%;background:var(--saffron);"></div></div>
          <span>${c.cnt}</span>
        </div>`).join('');
    }
  } catch (_) {}
}

// ── Load all complaints ────────────────────────────────
async function loadComplaints() {
  try {
    const res  = await fetch(`${API}/api/admin/complaints`);
    const data = await res.json();
    _renderComplaintsTable(data);
  } catch (_) {}
}

function _renderComplaintsTable(complaints) {
  const tbody = document.getElementById('complaintsBody');
  if (!tbody) return;
  const STATUS_CLASS = {
    pending:'badge-pending','in-progress':'badge-inprog','accepted':'badge-assigned',
    resolved:'badge-resolved','proof-submitted':'badge-inprog',
    'needs-review':'badge-escalated',rejected:'badge-escalated',escalated:'badge-escalated',
  };
  const PRIO_CLASS = { critical:'badge-critical', high:'badge-high', medium:'badge-medium', low:'badge-low' };
  const AI_ICON = {
    verified:      '<span style="color:var(--green);display:inline-flex;align-items:center;gap:3px;font-weight:700;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>Verified</span>',
    'needs-review':'<span style="color:var(--amber);display:inline-flex;align-items:center;gap:3px;font-weight:700;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>Review</span>',
    rejected:      '<span style="color:var(--red);display:inline-flex;align-items:center;gap:3px;font-weight:700;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Rejected</span>',
  };

  tbody.innerHTML = complaints.map(c => `
    <tr data-status="${c.status}">
      <td style="font-weight:700;">${c.id}</td>
      <td>${c.description.substring(0,40)}…</td>
      <td>${c.name}</td>
      <td style="font-size:.8rem;">${c.location}</td>
      <td>${c.assigned_to || '—'}</td>
      <td><span class="badge ${PRIO_CLASS[c.priority]||''}">${c.priority}</span></td>
      <td><span class="badge ${STATUS_CLASS[c.status]||''}">${c.status.replace('-',' ')}</span></td>
      <td style="font-size:.78rem;">${c.sla_deadline || '—'}</td>
      <td>${c.ai_verified ? (AI_ICON[c.ai_verified] + ' ' + c.ai_verified) : '—'}</td>
    </tr>`).join('');
}

function filterComplaints() {
  const q      = (document.getElementById('adminSearch')?.value || '').toLowerCase();
  const status = document.getElementById('statusFilter')?.value || '';
  document.querySelectorAll('#complaintsBody tr').forEach(tr => {
    const txt = tr.textContent.toLowerCase();
    const ds  = tr.dataset.status || '';
    tr.style.display = (txt.includes(q) && (!status || ds === status)) ? '' : 'none';
  });
}

function _setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Init ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  showSection('overview');
  loadOverview();
  loadComplaints();
  // Refresh every 10s
  setInterval(() => {
    loadOverview();
    loadComplaints();
  }, 10000);
});
