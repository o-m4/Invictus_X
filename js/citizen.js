/**
 * citizen.js — Citizen Portal v2.1
 * FIX: All backend integration bugs fixed — see inline FIX comments.
 */

// FIX: API base from RT module if available, else fallback
const API = (typeof RT !== 'undefined') ? RT.API : 'http://localhost:8000';

let currentService = '';
let currentType    = '';

// ── Modal openers ──────────────────────────────────────
function openServiceForm(serviceName, fee, time) {
  currentService = serviceName;
  currentType    = 'service';  // FIX: Keep as 'service' — backend accepts this
  document.getElementById('modalTitle').textContent     = serviceName;
  document.getElementById('feeStrip').style.display     = 'flex';
  document.getElementById('feeStripAmount').textContent = fee;
  document.getElementById('feeStripTime').textContent   = time;
  _resetModal();
  document.getElementById('formModal').style.display = 'flex';
}

function openComplaintForm(issueType) {
  currentService = issueType;
  currentType    = 'complaint';  // FIX: Backend expects exactly 'complaint'
  document.getElementById('modalTitle').textContent     = 'Report: ' + issueType;
  document.getElementById('feeStrip').style.display     = 'none';
  _resetModal();
  document.getElementById('formModal').style.display = 'flex';
}

function closeModal()           { document.getElementById('formModal').style.display = 'none'; _resetModal(); }
function openCorruptionModal()  { document.getElementById('corruptionModal').style.display = 'flex'; }
function closeCorruptionModal() { document.getElementById('corruptionModal').style.display = 'none'; }

function _resetModal() {
  const form = document.getElementById('submissionForm');
  if (form) { form.style.display = 'block'; form.reset(); }
  const msg = document.getElementById('successMsg');
  if (msg) msg.style.display = 'none';
  // FIX: Re-enable submit button in case previous submit was interrupted
  const btn = form?.querySelector('button[type=submit]');
  if (btn) { btn.textContent = 'Submit Request'; btn.disabled = false; }
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

// ── Main DOMContentLoaded ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadLeaderboard();   // 👈 ADD THIS LINE
});

  // ── Complaint/Service submission ─────────────────────
  const form = document.getElementById('submissionForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name     = document.getElementById('citizenName').value.trim();
      const phone    = document.getElementById('citizenPhone').value.trim();
      const location = document.getElementById('citizenLocation').value.trim();
      const desc     = document.getElementById('citizenDesc').value.trim();

      if (!name || !phone || !location || !desc) {
        alert('Please fill all required fields.');
        return;
      }
      // FIX: Validate phone — must be 10 digits for backend to track by phone
      if (!/^\d{10}$/.test(phone)) {
        alert('Please enter a valid 10-digit mobile number.');
        return;
      }

      const submitBtn = form.querySelector('button[type=submit]');
      submitBtn.textContent = 'Submitting...';
      submitBtn.disabled    = true;

      let imageB64 = null;
      const fileInput = document.getElementById('citizenFile');
      if (fileInput && fileInput.files[0]) {
        try { imageB64 = await _fileToB64(fileInput.files[0]); } catch (_) {}
      }

      try {
        const res = await fetch(`${API}/api/complaints/submit`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            phone,
            location,
            description:   desc,
            category:      currentService,
            request_type:  currentType,  // FIX: 'complaint' or 'service'
            citizen_image: imageB64,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          form.style.display = 'none';
          document.getElementById('requestId').textContent    = data.complaint_id;
          document.getElementById('successMsg').style.display = 'block';

          // FIX: Save to localStorage with ALL fields the activity page needs
          _saveRequest({
            id:           data.complaint_id,
            type:         currentType,
            service:      currentService,
            name,
            phone,         // FIX: Store phone so activity page can fetch by phone
            location,
            description:  desc,
            status:       'pending',
            priority:     data.priority,
            assigned_to:  data.assigned_to,
            sla_deadline: data.sla_deadline,
            submitted:    new Date().toISOString().split('T')[0],
            progress:     0,
          });

          // Store phone for activity page to use
          if (phone) sessionStorage.setItem('citizen_phone', phone);

        } else {
          alert(data.detail || 'Submission failed. Please try again.');
          _resetModal();
        }

      } catch (err) {
        // FIX: Offline fallback — generate local ID and save
        console.warn('Backend offline, saving locally:', err);
        const id = _generateId();
        form.style.display = 'none';
        document.getElementById('requestId').textContent    = id;
        document.getElementById('successMsg').style.display = 'block';
        _saveRequest({
          id, type: currentType, service: currentService,
          name, phone, location, description: desc,
          status: 'pending', progress: 0,
          submitted: new Date().toISOString().split('T')[0],
        });
        if (phone) sessionStorage.setItem('citizen_phone', phone);

      } finally {
        submitBtn.textContent = 'Submit Request';
        submitBtn.disabled    = false;
      }
    });
  }

  // ── Corruption form ───────────────────────────────────
  const corrForm = document.getElementById('corruptionForm');
  if (corrForm) {
    corrForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dept    = document.getElementById('corrDept').value;
      const service = document.getElementById('corrService').value.trim();
      const amount  = document.getElementById('corrAmountDemanded').value.trim();
      if (!dept || !service || !amount) { alert('Please fill required fields.'); return; }

      let reportId = 'CR-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      try {
        const res  = await fetch(`${API}/api/corruption/report`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            official_name:   document.getElementById('corrOfficialName')?.value.trim() || null,
            department:      dept,
            amount_demanded: amount,
            service,
            description:     document.getElementById('corrDescription')?.value.trim() || '',
          }),
        });
        // FIX: Use backend-generated ID if available
        if (res.ok) {
          const data = await res.json();
          reportId   = data.report_id || reportId;
        }
      } catch (_) {}

      corrForm.style.display = 'none';
      document.getElementById('corrReportId').textContent     = reportId;
      document.getElementById('corrSuccessMsg').style.display = 'block';
    });
  }

  // ── Search filter ─────────────────────────────────────
  const search = document.getElementById('searchInput');
  if (search) search.addEventListener('input', filterCards);

  // ── Modal backdrop close ──────────────────────────────
  ['formModal', 'corruptionModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', e => { if (e.target === el) el.style.display = 'none'; });
  });

  // ── Real-time status updates ──────────────────────────
  if (typeof RT !== 'undefined') {
    RT.init().then(() => {
      RT.on('status_change', ev => {
        // FIX: Handle both complaint_id field names from event payload
        const cid = ev.complaint_id || ev.id;
        if (cid) _updateActivityBadge(cid, ev.status);
      });
      RT.on('ai_result', ev => {
        const cid = ev.complaint_id || ev.id;
        if (cid) {
          const displayStatus = ev.verdict === 'verified' ? 'resolved' : ev.verdict;
          _updateActivityBadge(cid, displayStatus);
        }
      });
      RT.start();
    });
  }

// ── Search / filter cards ──────────────────────────────
function filterCards() {
  const input = document.getElementById('searchInput');
  const q = input ? input.value.toLowerCase() : '';
  document.querySelectorAll('.service-card').forEach(c => {
    const t = c.querySelector('span')?.textContent?.toLowerCase() || '';
    c.style.display = (!q || t.includes(q)) ? '' : 'none';
  });
}

// ── Activity badge updater (used by RT events on citizen home) ──
function _updateActivityBadge(complaintId, status) {
  const LABELS = {
    pending:'Pending', accepted:'Accepted', 'in-progress':'In Progress',
    'proof-submitted':'Proof Submitted', resolved:'Resolved', verified:'Resolved',
    'needs-review':'Under Review', rejected:'Rejected', escalated:'Escalated',
  };
  const CLASSES = {
    pending:'badge-pending', accepted:'badge-assigned', 'in-progress':'badge-inprog',
    'proof-submitted':'badge-inprog', resolved:'badge-resolved', verified:'badge-resolved',
    'needs-review':'badge-escalated', rejected:'badge-escalated', escalated:'badge-escalated',
  };
  // FIX: Use data-cmp attribute selector — matches cards on citizen home page
  document.querySelectorAll(`[data-cmp="${complaintId}"] .badge`).forEach(el => {
    el.textContent = LABELS[status] || status;
    el.className   = 'badge ' + (CLASSES[status] || 'badge-pending');
  });
}

// ── localStorage helpers ───────────────────────────────
function _generateId() {
  // FIX: Always use CMP- prefix — backend uses CMP- for all complaint IDs
  return 'CMP-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function _saveRequest(req) {
  const all = JSON.parse(localStorage.getItem('crm_requests') || '[]');
  // FIX: Deduplicate by ID before saving
  const filtered = all.filter(r => r.id !== req.id);
  filtered.unshift(req);
  localStorage.setItem('crm_requests', JSON.stringify(filtered.slice(0, 50)));
}

function _fileToB64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadLeaderboard(city = "Sector") {
  const res = await fetch(`${API}/api/employees/leaderboard?city=${city}`);
  const data = await res.json();

  const container = document.getElementById("leaderboardList");
  if (!container) return;

  container.innerHTML = "";

  data.top.forEach(emp => {
    const div = document.createElement("div");
    div.className = "leader-item";
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
}