// citizen.js — Citizen Portal Logic

let currentService = "";
let currentType    = "";   // 'service' or 'complaint'

// ── Open service form (with official fee display) ──────
function openServiceForm(serviceName, fee, time) {
  currentService = serviceName;
  currentType    = "service";

  document.getElementById("modalTitle").textContent = serviceName;

  // Show the fee strip
  const strip = document.getElementById("feeStrip");
  strip.style.display = "flex";
  document.getElementById("feeStripAmount").textContent = fee;
  document.getElementById("feeStripTime").textContent   = time;

  resetModal();
  document.getElementById("formModal").style.display = "flex";
}

// ── Open complaint form ────────────────────────────────
function openComplaintForm(issueType) {
  currentService = issueType;
  currentType    = "complaint";

  document.getElementById("modalTitle").textContent = "Report: " + issueType;

  // Hide fee strip for complaints
  document.getElementById("feeStrip").style.display = "none";

  resetModal();
  document.getElementById("formModal").style.display = "flex";
}

// ── Close service/complaint modal ──────────────────────
function closeModal() {
  document.getElementById("formModal").style.display = "none";
  resetModal();
}

function resetModal() {
  document.getElementById("submissionForm").style.display  = "block";
  document.getElementById("successMsg").style.display      = "none";
  const f = document.getElementById("submissionForm");
  if (f) f.reset();
}

// ── Form submission ────────────────────────────────────
document.getElementById("submissionForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const name     = document.getElementById("citizenName").value.trim();
  const phone    = document.getElementById("citizenPhone").value.trim();
  const location = document.getElementById("citizenLocation").value.trim();
  const desc     = document.getElementById("citizenDesc").value.trim();

  if (!name || !phone || !location || !desc) {
    alert("Please fill all required fields.");
    return;
  }

  const requestId = generateId();
  const request = {
    id: requestId, type: currentType, service: currentService,
    name, phone, location, desc,
    status: "submitted",
    submitted: new Date().toISOString().split("T")[0],
    progress: 0
  };

  saveRequest(request);

  document.getElementById("submissionForm").style.display = "none";
  document.getElementById("requestId").textContent        = requestId;
  document.getElementById("successMsg").style.display     = "block";
});

// ── Corruption modal ───────────────────────────────────
function openCorruptionModal() {
  document.getElementById("corruptionModal").style.display = "flex";
  document.getElementById("corruptionForm").style.display  = "block";
  document.getElementById("corrSuccessMsg").style.display  = "none";
  document.getElementById("corruptionForm").reset();
}

function closeCorruptionModal() {
  document.getElementById("corruptionModal").style.display = "none";
}

document.getElementById("corruptionForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const dept   = document.getElementById("corrDept").value;
  const service = document.getElementById("corrService").value.trim();
  const amount  = document.getElementById("corrAmountDemanded").value.trim();

  if (!dept || !service || !amount) {
    alert("Please fill all required fields (Department, Service, Amount Demanded).");
    return;
  }

  // Generate anonymous report ID — no identity stored
  const reportId = "CR-" + Math.random().toString(36).substring(2, 8).toUpperCase();

  const report = {
    id: reportId,
    officialName:    document.getElementById("corrOfficialName").value.trim() || "Not provided",
    department:      dept,
    service:         service,
    officialFee:     document.getElementById("corrOfficialFee").value.trim(),
    amountDemanded:  amount,
    date:            document.getElementById("corrDate").value,
    description:     document.getElementById("corrDescription").value.trim(),
    reportedAt:      new Date().toISOString().split("T")[0]
  };

  // Save to localStorage (no personal identity)
  const reports = JSON.parse(localStorage.getItem("crm_corruption_reports") || "[]");
  reports.push(report);
  localStorage.setItem("crm_corruption_reports", JSON.stringify(reports));

  document.getElementById("corruptionForm").style.display = "none";
  document.getElementById("corrReportId").textContent     = reportId;
  document.getElementById("corrSuccessMsg").style.display = "block";
});

// ── Search / filter service cards ─────────────────────
document.getElementById("searchInput").addEventListener("input", function () {
  const q = this.value.toLowerCase();
  document.querySelectorAll(".service-card").forEach(card => {
    const text = card.querySelector("span").textContent.toLowerCase();
    card.style.display = text.includes(q) ? "" : "none";
  });
});

// ── Helpers ───────────────────────────────────────────
function generateId() {
  const prefix = currentType === "service" ? "SRV" : "CMP";
  return prefix + "-" + Math.floor(Math.random() * 900 + 100);
}

function saveRequest(req) {
  const existing = JSON.parse(localStorage.getItem("crm_requests") || "[]");
  existing.push(req);
  localStorage.setItem("crm_requests", JSON.stringify(existing));
}

// Close modals on overlay click
document.getElementById("formModal").addEventListener("click", function (e) {
  if (e.target === this) closeModal();
});
document.getElementById("corruptionModal").addEventListener("click", function (e) {
  if (e.target === this) closeCorruptionModal();
});
