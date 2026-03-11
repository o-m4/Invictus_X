// admin.js — Admin Dashboard Logic

// ── Section Navigation ────────────────────────────────
function showSection(name) {
  document.querySelectorAll(".admin-section").forEach(s => s.style.display = "none");
  document.querySelectorAll(".sidebar-link").forEach(l => l.classList.remove("active"));

  const section = document.getElementById("section-" + name);
  if (section) section.style.display = "block";

  const link = document.querySelector(`.sidebar-link[onclick*="${name}"]`);
  if (link) link.classList.add("active");
}

// ── Complaints Filter ─────────────────────────────────
function filterComplaints() {
  const query  = (document.getElementById("adminSearch")?.value || "").toLowerCase();
  const status = document.getElementById("statusFilter")?.value || "";

  document.querySelectorAll("#complaintsBody tr").forEach(row => {
    const text      = row.textContent.toLowerCase();
    const rowStatus = row.getAttribute("data-status") || "";

    const matchSearch = !query  || text.includes(query);
    const matchStatus = !status || rowStatus === status;

    row.style.display = matchSearch && matchStatus ? "" : "none";
  });
}

// ── Init ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  showSection("overview");
});
