/**
 * activity.js — Citizen Activity / Tracking Page v2.1
 *
 * FIX: Activity page now:
 *   1. Reads phone from sessionStorage (set during login or complaint submission)
 *   2. Fetches ALL complaints for that phone from backend
 *   3. Merges with localStorage data (offline fallback)
 *   4. Renders dynamic cards instead of relying on static HTML
 *   5. Polls RT events for live status updates
 *   6. Shows AI verification result per complaint
 */

const API = 'http://localhost:8000';

// Status display maps
const STATUS_LABEL = {
  pending:          'Pending',
  accepted:         'Accepted',
  'in-progress':    'In Progress',
  'proof-submitted':'Proof Submitted',
  resolved:         'Resolved',
  verified:         'Resolved',
  'needs-review':   'Under Review',
  rejected:         'Rejected',
  escalated:        'Escalated',
};
const STATUS_CLASS = {
  pending:          'badge-pending',
  accepted:         'badge-assigned',
  'in-progress':    'badge-inprog',
  'proof-submitted':'badge-inprog',
  resolved:         'badge-resolved',
  verified:         'badge-resolved',
  'needs-review':   'badge-escalated',
  rejected:         'badge-escalated',
  escalated:        'badge-escalated',
};
// Timeline step order
const TIMELINE_STEPS = ['pending', 'accepted', 'in-progress', 'proof-submitted', 'resolved'];
const STEP_LABELS    = ['Submitted', 'Assigned', 'In Progress', 'Proof Sent', 'Completed'];

// ── Get phone ──────────────────────────────────────────
function _getPhone() {
  // FIX: Try multiple sources — session storage, local storage, URL param
  const fromSession = sessionStorage.getItem('citizen_phone');
  if (fromSession) return fromSession;

  const fromUrl = new URLSearchParams(window.location.search).get('phone');
  if (fromUrl) return fromUrl;

  // FIX: Try reading from stored requests in localStorage
  const requests = JSON.parse(localStorage.getItem('crm_requests') || '[]');
  if (requests.length && requests[0].phone) return requests[0].phone;

  return null;
}

// ── Main load ──────────────────────────────────────────
async function loadActivity() {
  const container = document.getElementById('activityList');
  if (!container) return;

  const phone = _getPhone();

  // Show loading state
  container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);">Loading your requests...</div>';

  let complaints = [];

  if (phone) {
    try {
      const res = await fetch(`${API}/api/citizen/${phone}/requests`);
      if (res.ok) {
        complaints = await res.json();
        // FIX: Sync backend data back into localStorage so we're always current
        complaints.forEach(c => _syncToLocalStorage(c));
      }
    } catch (_) {
      // Backend offline — fall back to localStorage
    }
  }

  // FIX: If no backend results, fall back to localStorage
  if (!complaints.length) {
    complaints = JSON.parse(localStorage.getItem('crm_requests') || '[]');
  }

  if (!complaints.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:48px 20px;color:var(--text-muted);">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 12px;display:block;opacity:.4;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
        <div style="font-weight:700;color:var(--navy);margin-bottom:6px;">No requests yet</div>
        <div style="font-size:.84rem;">Submit a complaint or service request to see it here.</div>
        <a href="citizen.html" style="display:inline-block;margin-top:16px;" class="btn-primary">Go to Services</a>
      </div>`;
    return;
  }

  // Render all complaint cards
  container.innerHTML = '';
  complaints.forEach(c => container.appendChild(_buildCard(c)));
}

// ── Build a complaint card ─────────────────────────────
function _buildCard(c) {
  const id      = c.id || c.complaint_id;
  const status  = c.status || 'pending';
  const service = c.description || c.service || 'Request';
  const isResolved = ['resolved','verified'].includes(status);

  const card = document.createElement('div');
  card.className = 'request-card' + (isResolved ? ' resolved' : '');
  card.setAttribute('data-cmp', id);

  card.innerHTML = `
    <div class="request-header">
      <span class="request-id">${id}</span>
      <div style="display:flex;gap:7px;align-items:center;">
        <a href="chat.html?cmp=${id}&phone=${c.phone || _getPhone() || ''}" class="chat-link-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Chat
        </a>
        <span class="badge ${STATUS_CLASS[status] || 'badge-pending'}" id="badge-${id}">
          ${STATUS_LABEL[status] || status}
        </span>
      </div>
    </div>
    <div class="request-service">${service.substring(0,60)}${service.length>60?'...':''}
      ${c.category ? `<span style="margin-left:6px;font-size:.74rem;color:var(--text-muted);">${c.category}</span>` : ''}
    </div>

    ${_buildTimeline(status)}

    ${_buildFooter(c, status)}

    <!-- FIX: AI result row — shown when ai_verified is present -->
    <div id="ai-result-${id}" class="ai-result-row" style="display:${c.ai_verified ? 'flex' : 'none'};">
      ${c.ai_verified ? _buildAiRow(c.ai_verified, c.ai_confidence, c.ai_reason) : ''}
    </div>`;

  return card;
}

function _buildTimeline(status) {
  const stepIndex = Math.max(0, TIMELINE_STEPS.indexOf(status));
  const steps = TIMELINE_STEPS.map((s, i) => {
    const done   = i <= stepIndex || ['resolved','verified','needs-review','rejected'].includes(status);
    const active = i === stepIndex && !['resolved','verified'].includes(status);
    const circleClass = done ? 'done' : (active ? 'active' : 'pending');
    const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="15" height="15"><polyline points="20,6 9,17 4,12"/></svg>';
    return `
      <div class="timeline-step ${done ? 'completed' : ''}">
        <div class="step-circle ${circleClass}">${done ? checkSvg : ''}</div>
        <span>${STEP_LABELS[i]}</span>
      </div>
      ${i < TIMELINE_STEPS.length - 1 ? `<div class="timeline-line ${done && i < stepIndex ? 'filled' : ''}"></div>` : ''}`;
  }).join('');
  return `<div class="timeline">${steps}</div>`;
}

function _buildFooter(c, status) {
  const id = c.id || c.complaint_id;
  if (['resolved','verified'].includes(status)) {
    return `<div class="resolved-msg">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" style="vertical-align:middle;margin-right:4px;"><polyline points="20,6 9,17 4,12"/></svg>
      Resolved on: ${c.updated_at ? c.updated_at.split('T')[0] : (c.completed_at ? c.completed_at.split('T')[0] : 'Completed')}
    </div>`;
  }
  if (c.sla_deadline) {
    const daysLeft = _daysLeft(c.sla_deadline);
    const urgent   = daysLeft <= 0;
    return `<div class="time-remaining" style="${urgent ? 'color:var(--red);background:var(--red-soft);' : ''}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
      ${urgent ? 'SLA Breached' : `SLA: ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`}
      ${c.assigned_to ? ` &nbsp;|&nbsp; Assigned to: ${c.assigned_to}` : ''}
    </div>`;
  }
  return `<div class="request-service" style="font-size:.76rem;color:var(--text-muted);">
    ${c.assigned_to ? `Assigned to: ${c.assigned_to}` : 'Awaiting assignment'}
  </div>`;
}

function _buildAiRow(verdict, confidence, reason) {
  const color = verdict === 'verified' ? 'var(--green)' : verdict === 'rejected' ? 'var(--red)' : 'var(--amber)';
  const label = verdict === 'verified' ? 'AI Verified' : verdict === 'rejected' ? 'AI Rejected' : 'Under Review';
  return `<span style="color:${color};font-weight:800;font-size:.8rem;">${label}</span>
          <span style="color:var(--text-muted);font-size:.72rem;">${confidence || 0}% confidence</span>
          ${reason ? `<span style="color:var(--text-light);font-size:.72rem;">&nbsp;|&nbsp;${reason.substring(0,60)}</span>` : ''}`;
}

// ── Update a single card in DOM ────────────────────────
function _updateCard(id, data) {
  // FIX: Update badge by ID (not just data-cmp selector)
  const badge = document.getElementById('badge-' + id);
  if (badge) {
    badge.textContent = STATUS_LABEL[data.status] || data.status;
    badge.className   = 'badge ' + (STATUS_CLASS[data.status] || 'badge-pending');
  }

  // FIX: Also update the data-cmp badges for citizen home page compatibility
  document.querySelectorAll(`[data-cmp="${id}"] .badge`).forEach(el => {
    el.textContent = STATUS_LABEL[data.status] || data.status;
    el.className   = 'badge ' + (STATUS_CLASS[data.status] || 'badge-pending');
  });

  // Update AI result row
  if (data.ai_verified) {
    const aiEl = document.getElementById('ai-result-' + id);
    if (aiEl) {
      aiEl.style.display = 'flex';
      aiEl.innerHTML     = _buildAiRow(data.ai_verified, data.ai_confidence, data.ai_reason);
    }
  }
}

// ── Refresh from backend ───────────────────────────────
async function refreshStatuses() {
  // FIX: Fetch from backend for each stored request ID
  const requests = JSON.parse(localStorage.getItem('crm_requests') || '[]');
  for (const req of requests) {
    if (!req.id) continue;
    try {
      const res = await fetch(`${API}/api/complaints/track/${req.id}`);
      if (res.ok) {
        const data = await res.json();
        _updateCard(req.id, data);
        _syncToLocalStorage(data);
      }
      // FIX: 404 means complaint not in backend yet (local only) — not an error
    } catch (_) {}
  }
}

// ── Sync backend data into localStorage ───────────────
function _syncToLocalStorage(c) {
  const id = c.id || c.complaint_id;
  if (!id) return;
  const all = JSON.parse(localStorage.getItem('crm_requests') || '[]');
  const idx = all.findIndex(r => r.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...c };
  } else {
    all.unshift(c);
  }
  localStorage.setItem('crm_requests', JSON.stringify(all.slice(0, 50)));
}

// ── Helpers ────────────────────────────────────────────
function _daysLeft(slaDate) {
  const today = new Date(); today.setHours(0,0,0,0);
  const sla   = new Date(slaDate); sla.setHours(0,0,0,0);
  return Math.round((sla - today) / 86400000);
}

// ── Init ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Add CSS for AI result row if not already in activity.css
  const style = document.createElement('style');
  style.textContent = `
    .ai-result-row {
      align-items:center;gap:8px;flex-wrap:wrap;
      background:var(--bg);border-radius:var(--r-sm);
      padding:8px 12px;margin-top:8px;font-size:.78rem;
    }
  `;
  document.head.appendChild(style);

  await loadActivity();

  // FIX: RT-based live updates — re-render card when status changes
  if (typeof RT !== 'undefined') {
    await RT.init();
    RT.on('status_change', async ev => {
      const cid = ev.complaint_id || ev.id;
      if (!cid) return;
      // Fetch fresh data and update card
      try {
        const res = await fetch(`${API}/api/complaints/track/${cid}`);
        if (res.ok) {
          const data = await res.json();
          _updateCard(cid, data);
          _syncToLocalStorage(data);
        }
      } catch (_) {}
    });
    RT.on('ai_result', async ev => {
      const cid = ev.complaint_id || ev.id;
      if (!cid) return;
      try {
        const res = await fetch(`${API}/api/complaints/track/${cid}`);
        if (res.ok) {
          const data = await res.json();
          _updateCard(cid, data);
          _syncToLocalStorage(data);
        }
      } catch (_) {}
    });
    RT.start();
  }

  // Background refresh every 10s
  setInterval(refreshStatuses, 10000);
});
