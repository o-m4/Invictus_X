// employee.js — Employee Portal Logic

// ── Tab Switching ──────────────────────────────────────
function switchTab(tab, btn) {
  document.getElementById("tab-tasks").style.display     = tab === "tasks"     ? "block" : "none";
  document.getElementById("tab-documents").style.display = tab === "documents" ? "block" : "none";
  document.querySelectorAll(".emp-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

// ── Progress Update ────────────────────────────────────
function updateProgress(cmpId, value) {
  document.getElementById("prog-" + cmpId).textContent = value;
  const bar = document.getElementById("bar-" + cmpId);
  if (bar) bar.style.width = value + "%";
}

// ── Status Update ──────────────────────────────────────
function updateStatus(cmpId, status) {
  const card = document.getElementById("task-" + cmpId);
  if (!card) return;

  if (status === "resolved") {
    card.style.opacity = "0.5";
    card.style.pointerEvents = "none";
    const note = document.createElement("div");
    note.style.cssText = "color:#059669;font-weight:700;font-size:0.85rem;margin-top:8px;text-align:right;";
    note.textContent = "Marked as Resolved";
    card.appendChild(note);

    const r = document.getElementById("resolvedCount");
    const p = document.getElementById("pendingCount");
    if (r) r.textContent = parseInt(r.textContent) + 1;
    if (p) p.textContent = Math.max(0, parseInt(p.textContent) - 1);
  } else {
    const badge = card.querySelector(".badge");
    if (badge) { badge.className = "badge badge-inprog"; badge.textContent = "In Progress"; }
  }
}

// ── Notification Panel ─────────────────────────────────
let notifPanelOpen = false;

function toggleNotifPanel() {
  notifPanelOpen = !notifPanelOpen;
  document.getElementById("notifPanel").style.display  = notifPanelOpen ? "flex" : "none";
  document.getElementById("notifOverlay").style.display = notifPanelOpen ? "block" : "none";
  if (notifPanelOpen) renderNotifList();
}

// Sample pending assignments (new + already accepted)
const pendingNotifs = [
  { id: "CMP-008", title: "Broken footpath tiles", location: "Near Bus Stand, Sector 18", priority: "medium", time: "2 min ago", dist: "1.4 km away" },
  { id: "CMP-010", title: "Garbage overflow at junction", location: "Palam Vihar Road", priority: "high", time: "8 min ago", dist: "2.1 km away" },
];
const acceptedIds  = new Set();
const declinedIds  = new Set();

function renderNotifList() {
  const list  = document.getElementById("notifList");
  const empty = document.getElementById("notifEmpty");
  const active = pendingNotifs.filter(n => !declinedIds.has(n.id));
  list.innerHTML = "";

  if (active.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  active.forEach(n => {
    const accepted = acceptedIds.has(n.id);
    const div = document.createElement("div");
    div.className = "notif-item" + (accepted ? "" : " new");
    div.innerHTML = `
      <div class="notif-item-top">
        <span class="notif-item-id">${n.id}</span>
        <span class="notif-item-time">${n.time}</span>
      </div>
      <div class="notif-item-title">${n.title}</div>
      <div class="notif-item-loc">${n.location} &nbsp;|&nbsp; ${n.dist}</div>
      ${accepted
        ? `<div style="color:#059669;font-size:0.82rem;font-weight:700;padding:6px 0;">Accepted — Added to your tasks</div>`
        : `<div class="notif-item-actions">
             <button class="notif-decline-btn" onclick="declineNotif('${n.id}')">Decline</button>
             <button class="notif-accept-btn"  onclick="acceptNotif('${n.id}')">Accept</button>
           </div>`
      }
    `;
    list.appendChild(div);
  });
}

function acceptNotif(id) {
  acceptedIds.add(id);
  updateNotifDot();
  renderNotifList();
}

function declineNotif(id) {
  declinedIds.add(id);
  updateNotifDot();
  renderNotifList();
}

function updateNotifDot() {
  const remaining = pendingNotifs.filter(n => !acceptedIds.has(n.id) && !declinedIds.has(n.id)).length;
  const dot = document.getElementById("notifDot");
  if (dot) dot.classList.toggle("visible", remaining > 0);
}

// ── Uber-style incoming assignment toast ───────────────
let toastTimeout  = null;
let timerInterval = null;
let currentToast  = null;

const incomingAssignments = [
  { id: "CMP-012", title: "Waterlogging near main market", location: "Old Market Road, Sector 7", priority: "high", dist: "0.8 km away" },
];

function showAssignmentToast(assignment) {
  currentToast = assignment;
  document.getElementById("toastId").textContent       = assignment.id;
  document.getElementById("toastTitle").textContent    = assignment.title;
  document.getElementById("toastLocation").textContent = assignment.location;
  document.getElementById("toastDist").textContent     = assignment.dist;

  const prioEl = document.getElementById("toastPriority");
  prioEl.textContent  = assignment.priority.charAt(0).toUpperCase() + assignment.priority.slice(1);
  prioEl.className    = "toast-priority priority-" + assignment.priority;

  document.getElementById("assignmentToast").style.display = "block";

  // Countdown
  let secs = 30;
  document.getElementById("toastTimer").textContent = secs + "s";
  timerInterval = setInterval(() => {
    secs--;
    document.getElementById("toastTimer").textContent = secs + "s";
    if (secs <= 0) { autoDecline(); }
  }, 1000);

  // Auto-dismiss after 30s
  toastTimeout = setTimeout(autoDecline, 30000);

  // Also add to notif panel
  pendingNotifs.push({ ...assignment, time: "Just now" });
  updateNotifDot();
}

function acceptAssignment() {
  clearToast();
  if (currentToast) {
    acceptedIds.add(currentToast.id);
    updateNotifDot();
    showToastConfirm("Assignment " + currentToast.id + " accepted. Added to your tasks.");
  }
}

function rejectAssignment() {
  clearToast();
  if (currentToast) {
    declinedIds.add(currentToast.id);
    updateNotifDot();
  }
}

function autoDecline() {
  clearToast();
}

function clearToast() {
  clearTimeout(toastTimeout);
  clearInterval(timerInterval);
  document.getElementById("assignmentToast").style.display = "none";
  currentToast = null;
}

function showToastConfirm(msg) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#059669;color:white;padding:12px 20px;border-radius:10px;font-size:0.88rem;font-weight:700;z-index:400;box-shadow:0 4px 16px rgba(0,0,0,0.15);";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Document Viewer ────────────────────────────────────

function openDocViewer(cmpId) {
  // Switch to documents tab
  switchTab("documents", document.querySelectorAll(".emp-tab")[1]);
  // Expand that group
  const body  = document.getElementById("docbody-" + cmpId);
  const arrow = document.getElementById("arrow-" + cmpId);
  if (body)  { body.classList.add("open"); }
  if (arrow) { arrow.classList.add("open"); }
  // Scroll to it
  const group = document.querySelector(`.doc-group[data-id="${cmpId}"]`);
  if (group) group.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleDocGroup(cmpId) {
  const body  = document.getElementById("docbody-" + cmpId);
  const arrow = document.getElementById("arrow-" + cmpId);
  if (!body) return;
  body.classList.toggle("open");
  if (arrow) arrow.classList.toggle("open");
}

function filterDocs() {
  const q = document.getElementById("docSearch").value.toLowerCase();
  document.querySelectorAll(".doc-group").forEach(group => {
    const id   = (group.dataset.id   || "").toLowerCase();
    const name = (group.dataset.name || "").toLowerCase();
    group.style.display = (id.includes(q) || name.includes(q)) ? "" : "none";
  });
}

function previewDoc(type, title) {
  document.getElementById("docPreviewTitle").textContent = title;

  let html = "";
  if (type === "photo") {
    html = `
      <div class="doc-preview-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
        <p><strong>Photo Preview</strong></p>
        <p style="margin-top:6px;">${title}</p>
        <small style="display:block;margin-top:8px;color:#94a3b8;">In production, the actual uploaded image would display here from cloud storage.</small>
      </div>
      <table class="doc-details-table" style="margin-top:16px;">
        <tr><td>File Type</td><td>JPEG Image</td></tr>
        <tr><td>Uploaded By</td><td>Citizen</td></tr>
        <tr><td>Status</td><td style="color:#059669;font-weight:700;">Verified</td></tr>
      </table>`;
  } else {
    html = `
      <div class="doc-preview-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <p><strong>PDF Document</strong></p>
        <p style="margin-top:6px;">${title}</p>
        <small style="display:block;margin-top:8px;color:#94a3b8;">In production, the PDF would open in an embedded viewer here.</small>
      </div>
      <table class="doc-details-table" style="margin-top:16px;">
        <tr><td>File Type</td><td>PDF Document</td></tr>
        <tr><td>Generated By</td><td>CRM System</td></tr>
        <tr><td>Status</td><td style="color:#059669;font-weight:700;">Available</td></tr>
      </table>
      <button class="btn-primary full-width" style="margin-top:4px;" onclick="alert('Download would trigger here in production.')">Download PDF</button>`;
  }

  document.getElementById("docPreviewContent").innerHTML = html;
  document.getElementById("docPreviewModal").style.display = "flex";
}

function closeDocPreview() {
  document.getElementById("docPreviewModal").style.display = "none";
}

// Close doc modal on overlay click
document.getElementById("docPreviewModal").addEventListener("click", function (e) {
  if (e.target === this) closeDocPreview();
});

// ── Init: show incoming toast after 3 seconds ──────────
window.addEventListener("DOMContentLoaded", function () {
  // Show notification dot — there are pending assignments
  updateNotifDot();
  document.getElementById("notifDot").classList.add("visible");

  // Simulate an incoming assignment after 3 seconds
  setTimeout(() => {
    showAssignmentToast(incomingAssignments[0]);
  }, 3000);
});
