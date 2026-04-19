/**
 * employee.js — Employee Portal v2.1
 * FIX: All bugs fixed — see inline FIX comments.
 */

const API = (typeof RT !== 'undefined') ? RT.API : 'http://localhost:8000';

// FIX: Employee ID read from sessionStorage (set at login) with fallback
const EMPLOYEE_ID = sessionStorage.getItem('crm_emp_id') || 'EMP-02';

let pendingComplaintsCache = [];
let notifPanelOpen         = false;
let currentToast           = null;
let toastTimer             = null;
let toastCountdown         = null;

// ── Tab switching ──────────────────────────────────────
function switchTab(tab, btn) {
  document.getElementById('tab-tasks').style.display     = tab === 'tasks'     ? 'block' : 'none';
  document.getElementById('tab-documents').style.display = tab === 'documents' ? 'block' : 'none';
  document.querySelectorAll('.emp-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ── Progress slider ────────────────────────────────────
function updateProgress(cardId, value) {
  const el  = document.getElementById('prog-' + cardId);
  const bar = document.getElementById('bar-' + cardId);
  if (el)  el.textContent  = value;
  if (bar) bar.style.width = value + '%';
}

// ── Status update ──────────────────────────────────────
async function updateStatus(cardId, status) {
  // FIX: cardId is the DOM ID (no hyphens in some cases), complaint_id is the original ID
  // We store the original ID as a data attribute on the card
  const card = document.getElementById('task-' + cardId);
  const complaintId = card ? (card.dataset.complaintId || _cardIdToComplaintId(cardId)) : _cardIdToComplaintId(cardId);

  const progress = parseInt(document.getElementById('prog-' + cardId)?.textContent || '50');

  try {
    const res = await fetch(`${API}/api/complaints/update-status`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaint_id: complaintId,  // FIX: Use original CMP-XXX format
        new_status:   status,
        progress:     progress,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error('Status update failed:', err);
    }
  } catch (err) {
    console.warn('Status update offline:', err);
  }

  if (!card) return;

  if (status === 'resolved') {
    card.style.opacity       = '0.55';
    card.style.pointerEvents = 'none';
    const msg = document.createElement('div');
    msg.style.cssText = 'color:var(--green);font-weight:700;font-size:.82rem;margin-top:8px;text-align:right;display:flex;align-items:center;justify-content:flex-end;gap:4px;';
    msg.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>Marked Resolved';
    card.appendChild(msg);
    const r = document.getElementById('resolvedCount');
    const p = document.getElementById('pendingCount');
    if (r) r.textContent = parseInt(r.textContent || '0') + 1;
    if (p) p.textContent = Math.max(0, parseInt(p.textContent || '0') - 1);
  } else {
    const badge = card.querySelector('.badge');
    if (badge) {
      badge.className   = 'badge badge-inprog';
      badge.textContent = 'In Progress';
    }
  }
}

// FIX: Convert DOM card ID back to original complaint ID with hyphen
function _cardIdToComplaintId(cardId) {
  // cardId stored as 'CMP002' → original was 'CMP-002'
  // Or 'CMPABCDE' → 'CMP-ABCDE'
  if (cardId.includes('-')) return cardId;  // already has hyphen
  // Insert hyphen after the 3-letter prefix
  const prefix = cardId.substring(0, 3);    // 'CMP'
  const suffix = cardId.substring(3);       // '002' or 'ABCDE'
  return prefix + '-' + suffix;
}

// ── Accept task ────────────────────────────────────────
async function acceptTask(complaintId, employeeId) {
  // FIX: Use actual EMPLOYEE_ID from session, not hardcoded
  const empId    = employeeId || EMPLOYEE_ID;
  const deadline = prompt('Set completion deadline (YYYY-MM-DD):', _defaultDeadline());
  if (!deadline) return;

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    alert('Please enter date in YYYY-MM-DD format.');
    return;
  }

  try {
    const res = await fetch(`${API}/api/complaints/accept`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaint_id: complaintId,
        employee_id:  empId,
        deadline:     deadline,
      }),
    });
    const data = await res.json();

    if (res.ok || data.complaint) {
      showToast('Task accepted. Deadline: ' + deadline, 'green');
      closeNotifPanel();

      // FIX: Remove from pending cache immediately
      pendingComplaintsCache = pendingComplaintsCache.filter(
        c => (c.id || c.complaint_id) !== complaintId
      );
      _updateBellBadge(pendingComplaintsCache.length);

      // FIX: Add the accepted task directly to the task list without full reload
      if (data.complaint) {
        _addOrUpdateTaskCard(data.complaint);
      } else {
        // Fetch and render
        await loadMyTasks(empId);
      }
    } else {
      showToast(data.detail || data.message || 'Could not accept task.', 'red');
    }
  } catch (err) {
    console.warn('Accept offline:', err);
    showToast('Connection error — please retry.', 'red');
  }
}

// ── Add or update task card in task list ───────────────
function _addOrUpdateTaskCard(complaint) {
  const list   = document.getElementById('taskList');
  if (!list) return;
  // FIX: Build DOM card ID consistently
  const cardId = complaint.id.replace(/-/g, '');  // 'CMP-002' → 'CMP002'
  const existing = document.getElementById('task-' + cardId);
  if (existing) {
    // Update badge if already shown
    const badge = existing.querySelector('.badge');
    if (badge) { badge.className = 'badge badge-assigned'; badge.textContent = 'Accepted'; }
    return;
  }
  list.insertAdjacentHTML('afterbegin', _buildTaskCard(complaint));
}

// ── Proof modal ────────────────────────────────────────
function openProofModal(complaintId) {
  document.getElementById('proofCmpId').value          = complaintId;
  document.getElementById('proofNote').value           = '';
  const fileEl = document.getElementById('proofFile');
  if (fileEl) fileEl.value = '';
  document.getElementById('proofResult').style.display = 'none';
  document.getElementById('proofForm').style.display   = 'block';
  document.getElementById('proofModal').style.display  = 'flex';
}

function closeProofModal() {
  document.getElementById('proofModal').style.display = 'none';
}

// ── Main DOMContentLoaded ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadEmployeeLeaderboard("EMP-02"); // 👈 ADD
  loadEmployeeProfile("EMP-02");
});

  // Proof form submit
  const proofForm = document.getElementById('proofForm');
  if (proofForm) {
    proofForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const complaintId = document.getElementById('proofCmpId').value;
      const note        = document.getElementById('proofNote').value.trim();
      const fileInp     = document.getElementById('proofFile');

      if (!note) { alert('Please write a completion note.'); return; }

      const btn = proofForm.querySelector('button[type=submit]');
      btn.textContent = 'Submitting...';
      btn.disabled    = true;

      let imageB64 = null;
      if (fileInp && fileInp.files[0]) {
        try { imageB64 = await _fileToB64(fileInp.files[0]); } catch (_) {}
      }

      try {
        const res  = await fetch(`${API}/api/complaints/submit-proof`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            complaint_id: complaintId,
            proof_note:   note,
            proof_image:  imageB64,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Proof submission failed.');
        }
        const data = await res.json();

        // Show AI result
        proofForm.style.display = 'none';
        const resultEl = document.getElementById('proofResult');
        resultEl.style.display = 'block';
        _renderAiResult(resultEl, data);

        // FIX: Update task card badge with correct selector
        const cardId = complaintId.replace(/-/g, '');
        const card   = document.getElementById('task-' + cardId);
        if (card) {
          const badge   = card.querySelector('.badge');
          const verdict = data.ai_verdict;
          if (badge) {
            badge.textContent = verdict === 'verified' ? 'Verified'
                              : verdict === 'rejected'  ? 'Rejected'
                              : 'Under Review';
            badge.className   = 'badge ' + (
              verdict === 'verified' ? 'badge-resolved' :
              verdict === 'rejected' ? 'badge-escalated' : 'badge-processing'
            );
          }
          // FIX: Fade card if verified/resolved
          if (verdict === 'verified') {
            card.style.opacity       = '0.6';
            card.style.pointerEvents = 'none';
          }
        }

      } catch (err) {
        alert(err.message || 'Could not submit proof. Please try again.');
      } finally {
        btn.textContent = 'Submit Proof';
        btn.disabled    = false;
      }
    });
  }

  // Overlays
  const notifOverlay = document.getElementById('notifOverlay');
  if (notifOverlay) notifOverlay.addEventListener('click', closeNotifPanel);

  const docModal = document.getElementById('docPreviewModal');
  if (docModal) docModal.addEventListener('click', e => { if (e.target === docModal) closeDocPreview(); });

  const proofModal = document.getElementById('proofModal');
  if (proofModal) proofModal.addEventListener('click', e => { if (e.target === proofModal) closeProofModal(); });

  // Real-time
  if (typeof RT !== 'undefined') {
    RT.init().then(async () => {
      await loadPendingQueue();
      await loadMyTasks(EMPLOYEE_ID);

      RT.on('new_complaint', ev => {
        // FIX: Check if it's not already in cache before adding
        const alreadyIn = pendingComplaintsCache.some(
          c => (c.id || c.complaint_id) === (ev.id || ev.complaint_id)
        );
        if (!alreadyIn) {
          pendingComplaintsCache.unshift(ev);
          _updateBellBadge(pendingComplaintsCache.length);
          _showIncomingToast(ev);
        }
      });

      RT.on('status_change', ev => {
        const cid    = ev.complaint_id || ev.id;
        const cardId = cid ? cid.replace(/-/g, '') : null;
        if (!cardId) return;
        const card = document.getElementById('task-' + cardId);
        if (card) {
          const badge = card.querySelector('.badge');
          if (badge && ev.status) {
            const lbl = {
              accepted:'Accepted','in-progress':'In Progress',
              'proof-submitted':'Proof Sent','escalated':'Escalated',
            };
            badge.textContent = lbl[ev.status] || ev.status;
          }
        }
        // FIX: Update progress bar if progress is included
        if (ev.progress !== undefined && ev.progress !== null && cardId) {
          updateProgress(cardId, ev.progress);
        }
      });

      RT.on('ai_result', ev => {
        const verdict = ev.verdict;
        showToast(
          `Complaint ${ev.complaint_id}: AI ${verdict}`,
          verdict === 'verified' ? 'green' : 'amber'
        );
      });

      RT.start();
    });
  } else {
    // No RT available — load directly
    loadPendingQueue();
    loadMyTasks(EMPLOYEE_ID);
  }

  updateNotifDot();

// ── Load pending queue ─────────────────────────────────
async function loadPendingQueue() {
  try {
    const res  = await fetch(`${API}/api/employee/queue/pending`);
    if (!res.ok) return;
    const data = await res.json();
    pendingComplaintsCache = Array.isArray(data) ? data : [];
    _updateBellBadge(pendingComplaintsCache.length);
  } catch (err) {
    console.warn('Could not load pending queue:', err);
  }
}

// ── Load tasks for employee ────────────────────────────
async function loadMyTasks(employeeId) {
  try {
    const res   = await fetch(`${API}/api/employee/${employeeId}/tasks`);
    if (!res.ok) return;
    const tasks = await res.json();
    if (Array.isArray(tasks)) _renderTaskList(tasks);
  } catch (err) {
    console.warn('Could not load tasks:', err);
  }
}

function _renderTaskList(tasks) {
  const list = document.getElementById('taskList');
  if (!list) return;
  tasks.forEach(t => {
    const cardId   = t.id.replace(/-/g, '');
    const existing = document.getElementById('task-' + cardId);
    if (!existing) {
      list.insertAdjacentHTML('afterbegin', _buildTaskCard(t));
    } else {
      // FIX: Update existing card's badge if status changed
      const badge = existing.querySelector('.badge');
      const statMap = {
        accepted:'badge-assigned','in-progress':'badge-inprog',
        'proof-submitted':'badge-inprog','escalated':'badge-escalated',
      };
      if (badge && statMap[t.status]) {
        badge.className   = 'badge ' + statMap[t.status];
        badge.textContent = t.status.replace('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
      }
    }
  });
}

function _buildTaskCard(t) {
  // FIX: Store both the DOM-safe ID and original ID
  const cardId  = t.id.replace(/-/g, '');           // for DOM IDs
  const origId  = t.id;                              // for API calls
  const priority = t.priority || 'medium';
  const prioBadge = priority === 'critical' ? 'badge-critical'
                  : priority === 'high'     ? 'badge-high'
                  : priority === 'medium'   ? 'badge-medium'
                  : 'badge-low';
  const isOverdue = t.status === 'escalated' || (t.sla_deadline && t.sla_deadline < new Date().toISOString().split('T')[0]);
  const deadline  = t.deadline_custom || t.sla_deadline || '—';
  const progress  = t.progress || 0;

  return `
  <div class="task-card ${isOverdue ? 'overdue' : ''}" id="task-${cardId}" data-complaint-id="${origId}">
    <div class="task-top">
      <div>
        <div class="task-id">${origId}</div>
        <div class="task-title">${(t.description || '').substring(0, 55)}${(t.description||'').length>55?'...':''}</div>
        <div class="task-location">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${t.location || ''}
        </div>
      </div>
      <div class="task-top-right">
        <span class="badge ${prioBadge}">${priority}</span>
        <button class="doc-btn" onclick="openDocViewer('${cardId}')">View Docs</button>
      </div>
    </div>
    <div class="task-meta">
      <span>Citizen: ${t.name || '—'} &nbsp;|&nbsp; ${t.phone || ''}</span>
      <span ${isOverdue ? 'class="overdue-text"' : ''}>
        ${isOverdue ? 'SLA Breached: ' : 'Deadline: '}${deadline}
      </span>
    </div>
    <div class="progress-wrap">
      <div class="progress-label">Progress: <span id="prog-${cardId}">${progress}</span>%</div>
      <input type="range" class="progress-slider" min="0" max="100" value="${progress}"
             oninput="updateProgress('${cardId}', this.value)"/>
      <div class="progress-bar-visual">
        <div class="progress-bar-fill" id="bar-${cardId}"
             style="width:${progress}%;${isOverdue ? 'background:var(--red);' : ''}"></div>
      </div>
    </div>
    <div class="task-actions">
      <a href="chat-employee.html?cmp=${origId}" class="btn-chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Chat
      </a>
      <button class="btn-secondary" onclick="updateStatus('${cardId}', 'in-progress')">In Progress</button>
      <button class="btn-primary"   onclick="openProofModal('${origId}')">Submit Proof</button>
    </div>
  </div>`;
}

// ── AI result renderer ─────────────────────────────────
function _renderAiResult(container, data) {
  const v      = data.ai_verdict;
  const c      = data.ai_confidence || 0;
  const colors = { verified:'#15803D', 'needs-review':'#D97706', rejected:'#DC2626' };
  const labels = { verified:'Work Verified', 'needs-review':'Needs Manual Review', rejected:'Proof Rejected' };
  const color  = colors[v] || '#64748B';
  const iconSvg = v === 'verified'
    ? '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9,12 11,14 15,10"/></svg>'
    : v === 'rejected'
    ? '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    : '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>';

  container.innerHTML = `
    <div style="text-align:center;padding:14px 0 8px;">
      <div style="color:${color};margin-bottom:8px;">${iconSvg}</div>
      <div style="font-size:1.05rem;font-weight:800;color:${color};margin-bottom:5px;font-family:'Merriweather',Georgia,serif;">${labels[v] || v}</div>
      <div style="font-size:.82rem;color:var(--text-light);margin-bottom:14px;line-height:1.5;">${data.ai_reason || ''}</div>
      <div style="background:var(--bg);border-radius:var(--r-md);padding:12px;margin-bottom:14px;">
        <div style="font-size:.7rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;margin-bottom:6px;">AI Confidence Score</div>
        <div style="height:10px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:5px;">
          <div style="height:100%;width:${c}%;background:${color};border-radius:99px;"></div>
        </div>
        <div style="font-size:.82rem;font-weight:700;color:${color};">${c}%</div>
      </div>
      <button onclick="closeProofModal()" class="btn-primary full-width">Close</button>
    </div>`;
}

// ── Notification panel ─────────────────────────────────
function toggleNotifPanel() { notifPanelOpen ? closeNotifPanel() : openNotifPanel(); }

function openNotifPanel() {
  notifPanelOpen = true;
  document.getElementById('notifPanel').style.display   = 'flex';
  document.getElementById('notifOverlay').style.display = 'block';
  renderNotifList();
  // Refresh queue when panel opens
  loadPendingQueue().then(renderNotifList);
}

function closeNotifPanel() {
  notifPanelOpen = false;
  document.getElementById('notifPanel').style.display   = 'none';
  document.getElementById('notifOverlay').style.display = 'none';
}

function renderNotifList() {
  const list  = document.getElementById('notifList');
  const empty = document.getElementById('notifEmpty');
  if (!list) return;
  if (!pendingComplaintsCache.length) {
    list.innerHTML      = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = pendingComplaintsCache.slice(0, 10).map(c => {
    const cid  = c.id || c.complaint_id || '—';
    const desc = (c.description || c.title || '').substring(0, 60);
    const prio = (c.priority || 'medium').toUpperCase();
    return `
      <div class="notif-item new">
        <div class="notif-item-top">
          <span class="notif-item-id">${cid}</span>
          <span class="notif-item-time">${prio}</span>
        </div>
        <div class="notif-item-title">${desc}</div>
        <div class="notif-item-loc">${c.location || ''}</div>
        <div class="notif-item-actions">
          <button class="notif-decline-btn" onclick="declineNotif('${cid}')">Decline</button>
          <button class="notif-accept-btn"  onclick="acceptTask('${cid}', '${EMPLOYEE_ID}')">Accept</button>
        </div>
      </div>`;
  }).join('');
}

function declineNotif(id) {
  pendingComplaintsCache = pendingComplaintsCache.filter(c => (c.id || c.complaint_id) !== id);
  _updateBellBadge(pendingComplaintsCache.length);
  renderNotifList();
}

function updateNotifDot() {
  const dot = document.getElementById('notifDot');
  if (dot) dot.classList.toggle('visible', pendingComplaintsCache.length > 0);
}

function _updateBellBadge(count) {
  const dot = document.getElementById('notifDot');
  if (dot) dot.classList.toggle('visible', count > 0);
}

// ── Toast notification ─────────────────────────────────
function _showIncomingToast(complaint) {
  // Clear any existing toast
  _clearToast();
  currentToast = complaint;

  const cid  = complaint.id || complaint.complaint_id || '—';
  const desc = (complaint.description || complaint.title || '').substring(0, 55);
  const prio = complaint.priority || 'medium';

  const el = document.getElementById('assignmentToast');
  if (!el) return;

  document.getElementById('toastId').textContent       = cid;
  document.getElementById('toastTitle').textContent    = desc;
  document.getElementById('toastLocation').textContent = complaint.location || '';
  document.getElementById('toastDist').textContent     = complaint.dist || '';

  const prioEl = document.getElementById('toastPriority');
  if (prioEl) {
    prioEl.textContent = prio.charAt(0).toUpperCase() + prio.slice(1);
    prioEl.className   = 'toast-priority priority-' + prio;
  }

  el.style.display = 'block';

  let secs = 30;
  document.getElementById('toastTimer').textContent = secs + 's';
  toastCountdown = setInterval(() => {
    secs--;
    const timerEl = document.getElementById('toastTimer');
    if (timerEl) timerEl.textContent = secs + 's';
    if (secs <= 0) _clearToast();
  }, 1000);
  toastTimer = setTimeout(_clearToast, 30000);
}

function acceptAssignment() {
  if (!currentToast) return;
  const id = currentToast.id || currentToast.complaint_id;
  _clearToast();
  acceptTask(id, EMPLOYEE_ID);
}

function rejectAssignment() { _clearToast(); }

function _clearToast() {
  clearTimeout(toastTimer);
  clearInterval(toastCountdown);
  const el = document.getElementById('assignmentToast');
  if (el) el.style.display = 'none';
  currentToast = null;
}

// ── Document viewer ────────────────────────────────────
function openDocViewer(cardId) {
  switchTab('documents', document.querySelectorAll('.emp-tab')[1]);
  document.getElementById('docbody-' + cardId)?.classList.add('open');
  document.getElementById('arrow-'   + cardId)?.classList.add('open');
  document.querySelector(`.doc-group[data-id="${cardId}"]`)
    ?.scrollIntoView({ behavior: 'smooth' });
}

function toggleDocGroup(cardId) {
  document.getElementById('docbody-' + cardId)?.classList.toggle('open');
  document.getElementById('arrow-'   + cardId)?.classList.toggle('open');
}

function filterDocs() {
  const q = (document.getElementById('docSearch')?.value || '').toLowerCase();
  document.querySelectorAll('.doc-group').forEach(g => {
    g.style.display = g.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function previewDoc(type, title) {
  document.getElementById('docPreviewTitle').textContent = title;
  const iconSvg = type === 'photo'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="1.5" width="48" height="48"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="1.5" width="48" height="48"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>`;
  document.getElementById('docPreviewContent').innerHTML = `
    <div class="doc-preview-placeholder">${iconSvg}
      <p><strong>${title}</strong></p>
      <small>In production this renders the actual file.</small>
    </div>
    <table class="doc-details-table" style="margin-top:14px;">
      <tr><td>Type</td><td>${type === 'photo' ? 'JPEG Image' : 'PDF Document'}</td></tr>
      <tr><td>Status</td><td style="color:var(--green);font-weight:700;">Available</td></tr>
    </table>
    ${type === 'pdf' ? `<button class="btn-primary full-width" style="margin-top:8px;" onclick="alert('Download triggered in production.')">Download PDF</button>` : ''}`;
  document.getElementById('docPreviewModal').style.display = 'flex';
}

function closeDocPreview() {
  document.getElementById('docPreviewModal').style.display = 'none';
}

// ── Helpers ────────────────────────────────────────────
function showToast(msg, type = 'green') {
  const el = document.createElement('div');
  const bg = { green:'#15803D', red:'#DC2626', amber:'#D97706' }[type] || '#15803D';
  el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:11px 20px;border-radius:var(--r-full);font-size:.86rem;font-weight:700;z-index:500;box-shadow:var(--sh-lg);white-space:nowrap;`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function _defaultDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().split('T')[0];
}

function _fileToB64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadEmployeeLeaderboard(employeeId, city = "Sector") {
  const res = await fetch(`${API}/api/employees/leaderboard?city=${city}&employee_id=${employeeId}`);
  const data = await res.json();

  const container = document.getElementById("leaderboardList");
  if (!container) return;

  container.innerHTML = "";

  data.top.forEach(emp => {
    const highlight = emp.id === employeeId ? "style='color:orange;font-weight:bold'" : "";

    const div = document.createElement("div");
   div.innerHTML = `
  <div class="leader-left">
    <span class="rank">#${emp.rank}</span>
    <span class="name">${emp.name}</span>
  </div>

  <div class="leader-right">
    ${emp.resolved} tasks
  </div>
`;
    container.appendChild(div);
  });

  // show own rank if not in top 20
  if (data.current_user && data.current_user.rank > 20) {
    const me = document.createElement("div");
    me.innerHTML = `
      <hr>
      Your Rank: #${data.current_user.rank}
    `;
    container.appendChild(me);
  }
}
async function loadEmployeeProfile(employeeId) {
  const res = await fetch(`${API}/api/employee/profile/${employeeId}`);
  const data = await res.json();

  document.getElementById("profileName").textContent = data.name;
  document.getElementById("profileDept").textContent = data.department;

  document.getElementById("totalTasks").textContent = data.total;
  document.getElementById("resolvedTasks").textContent = data.resolved;
  document.getElementById("pendingTasks").textContent = data.pending;

  document.getElementById("profileRating").textContent = data.rating;

  document.getElementById("profileAvatar").textContent = data.name[0];

  // badge logic
  let badge = "🥉 Performer";
  if (data.resolved > 20) badge = "🥇 Top Performer";
  else if (data.resolved > 10) badge = "🥈 Rising Star";

  document.getElementById("profileBadge").textContent = badge;
}
function showProfile() {
  document.getElementById("profileSection").style.display = "block";
}

function toggleProfileMenu() {
  const menu = document.getElementById("profileMenu");
  menu.style.display = menu.style.display === "block" ? "none" : "block";
}
document.addEventListener("click", function(e) {
  const menu = document.getElementById("profileMenu");
  const user = document.querySelector(".user-info");

  if (!user.contains(e.target)) {
    menu.style.display = "none";
  }
});