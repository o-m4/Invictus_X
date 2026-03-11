// activity.js — Activity Page Logic
// Loads user's submitted requests from localStorage and renders them dynamically.

document.addEventListener("DOMContentLoaded", function () {
  const requests = JSON.parse(localStorage.getItem("crm_requests") || "[]");
  if (requests.length === 0) return; // keep demo cards visible if no real data

  const main = document.querySelector(".activity-main");

  // Remove demo cards
  main.querySelectorAll(".request-card").forEach(c => c.remove());

  if (requests.length === 0) {
    const empty = document.createElement("p");
    empty.style.cssText = "color:#64748b;text-align:center;margin-top:40px;";
    empty.textContent = "No requests submitted yet.";
    main.appendChild(empty);
    return;
  }

  requests.slice().reverse().forEach(req => {
    const card = buildCard(req);
    main.appendChild(card);
  });
});

function buildCard(req) {
  const statusMap = {
    submitted:    { step: 0, badge: "badge-pending",   label: "Submitted" },
    assigned:     { step: 1, badge: "badge-assigned",  label: "Assigned" },
    processing:   { step: 2, badge: "badge-processing",label: "Processing" },
    resolved:     { step: 3, badge: "badge-resolved",  label: "Resolved" },
  };
  const current = statusMap[req.status] || statusMap["submitted"];
  const steps = ["Submitted", "Assigned", "Processing", "Completed"];

  const card = document.createElement("div");
  card.className = "request-card" + (req.status === "resolved" ? " resolved" : "");

  const idPrefix = req.type === "service" ? "Service Request" : "Complaint";

  card.innerHTML = `
    <div class="request-header">
      <span class="request-id">${idPrefix} ${req.id}</span>
      <span class="badge ${current.badge}">${current.label}</span>
    </div>
    <div class="request-service">${req.service}</div>
    <div class="timeline" id="timeline-${req.id}"></div>
    <div class="${req.status === "resolved" ? "resolved-msg" : "time-remaining"}">
      ${req.status === "resolved" ? "Resolved on: " + req.submitted : "Submitted on: " + req.submitted}
    </div>
  `;

  // Build timeline
  const timeline = card.querySelector(`#timeline-${req.id}`);
  const stepIndex = current.step;

  steps.forEach((step, i) => {
    const stepEl = document.createElement("div");
    stepEl.className = "timeline-step" + (i <= stepIndex ? " completed" : "");

    const circle = document.createElement("div");
    circle.className = "step-circle " + (i < stepIndex ? "done" : i === stepIndex ? "active" : "pending");
    circle.innerHTML = i <= stepIndex
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2"><circle cx="12" cy="12" r="4"/></svg>`;

    const label = document.createElement("span");
    label.textContent = step;

    stepEl.appendChild(circle);
    stepEl.appendChild(label);
    timeline.appendChild(stepEl);

    if (i < steps.length - 1) {
      const line = document.createElement("div");
      line.className = "timeline-line" + (i < stepIndex ? " filled" : "");
      timeline.appendChild(line);
    }
  });

  return card;
}
