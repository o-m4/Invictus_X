// chat.js — Citizen-Employee Chat Logic
// Works for both chat.html (citizen) and chat-employee.html (employee)

const IS_EMPLOYEE = (window.USER_ROLE === "employee");

// ── Seed message history per complaint ────────────────
const SEED_MESSAGES = {
  "CMP-002": [
    { from: "employee", name: "Suresh Kumar",  text: "Hello, I have received your complaint about the pothole near school zone. I will inspect the site soon.", time: "9:45 AM", type: "text" },
    { from: "citizen",  name: "Priya Patel",   text: "Thank you. It is very dangerous, especially for children going to school.", time: "9:52 AM", type: "text" },
    { from: "employee", name: "Suresh Kumar",  text: "Understood. I have marked it as high priority. Work will begin within 2 days.", time: "10:05 AM", type: "text" },
    { from: "system",   name: "System",        text: "Status updated to: In Progress", time: "10:10 AM", type: "status" },
    { from: "citizen",  name: "Priya Patel",   text: "When will the work be completed?", time: "10:28 AM", type: "text" },
    { from: "employee", name: "Suresh Kumar",  text: "I will visit the site tomorrow morning and give you an update.", time: "10:32 AM", type: "text" },
  ],
  "CMP-003": [
    { from: "employee", name: "Ravi Singh",    text: "I have noted your complaint about garbage collection in Nehru Nagar Colony.", time: "Yesterday", type: "text" },
    { from: "citizen",  name: "Anita Gupta",   text: "It has been 3 days. The smell is unbearable.", time: "Yesterday", type: "text" },
    { from: "employee", name: "Ravi Singh",    text: "Garbage collection scheduled for 6 AM tomorrow. I apologize for the delay.", time: "Yesterday", type: "text" },
  ],
  "CMP-004": [
    { from: "employee", name: "Deepak Yadav",  text: "We have identified a burst pipe in your area. Repair work is ongoing.", time: "Mar 6", type: "text" },
    { from: "citizen",  name: "Vikram Joshi",  text: "Please hurry, we have not had water for 2 days.", time: "Mar 6", type: "text" },
    { from: "employee", name: "Deepak Yadav",  text: "Water supply will be restored by evening. Thank you for your patience.", time: "Mar 6", type: "text" },
  ],
  "CMP-005": [
    { from: "citizen",  name: "Sunita Mehta",  text: "The dogs are still here, please help. My children are scared to go out.", time: "9:10 AM", type: "text" },
    { from: "employee", name: "Suresh Kumar",  text: "I have forwarded your complaint to the Animal Control team. They will visit today.", time: "9:14 AM", type: "text" },
  ],
  "CMP-006": [
    { from: "citizen",  name: "Mohan Das",     text: "The illegal construction is still going on and blocking the main road.", time: "Mar 7", type: "text" },
    { from: "employee", name: "Inspector Kaur","text: "I am escalating this to the enforcement department. Legal action will be taken.", time: "Mar 7", type: "text" },
    { from: "citizen",  name: "Mohan Das",     text: "This is urgent, construction continues even today.", time: "Mar 7", type: "text" },
  ]
};

// Complaint metadata
const COMPLAINT_INFO = {
  "CMP-002": { status: "in-progress", sla: "2026-03-10", dept: "Roads & PWD",   priority: "High" },
  "CMP-003": { status: "pending",     sla: "2026-03-09", dept: "Sanitation",    priority: "High" },
  "CMP-004": { status: "in-progress", sla: "2026-03-07", dept: "Water Supply",  priority: "Critical" },
  "CMP-005": { status: "pending",     sla: "2026-03-12", dept: "Animal Control",priority: "Medium" },
  "CMP-006": { status: "escalated",   sla: "2026-03-04", dept: "Enforcement",   priority: "Critical" },
};

let activeCmpId   = null;
let activeContact = null;
let typingTimer   = null;

// ── Load messages from localStorage or seed ────────────
function getMessages(cmpId) {
  const key  = "chat_" + cmpId;
  const saved = localStorage.getItem(key);
  if (saved) return JSON.parse(saved);
  // First time: seed
  const seed = SEED_MESSAGES[cmpId] || [];
  localStorage.setItem(key, JSON.stringify(seed));
  return seed;
}

function saveMessages(cmpId, messages) {
  localStorage.setItem("chat_" + cmpId, JSON.stringify(messages));
}

// ── Open a conversation ────────────────────────────────
function openChat(cmpId, contactName, dept, displayId) {
  activeCmpId   = cmpId;
  activeContact = { name: contactName, dept };

  // Sidebar active state
  document.querySelectorAll(".conv-item").forEach(i => i.classList.remove("active"));
  const convEl = document.getElementById("conv-" + cmpId);
  if (convEl) convEl.classList.add("active");

  // Clear unread
  const unread = document.getElementById("unread-" + cmpId);
  if (unread) unread.classList.add("hidden");

  // Update header
  const initial = contactName.charAt(0).toUpperCase();
  document.getElementById("chatAvatar").textContent = initial;
  document.getElementById("chatName").textContent   = contactName;
  document.getElementById("chatSub").textContent    = cmpId + " — " + dept;
  document.getElementById("typingName").textContent = contactName;

  // Update info bar
  const info = COMPLAINT_INFO[cmpId] || {};
  document.getElementById("infoId").textContent   = cmpId;
  document.getElementById("infoSla").textContent  = info.sla || "—";
  document.getElementById("infoDept").textContent = IS_EMPLOYEE ? (info.priority || "—") : (info.dept || "—");

  const statusEl = document.getElementById("infoStatus");
  statusEl.textContent = info.status ? (info.status.charAt(0).toUpperCase() + info.status.slice(1).replace("-", " ")) : "Pending";
  statusEl.className   = "badge " + getBadgeClass(info.status);

  renderMessages(cmpId);
}

function getBadgeClass(status) {
  return { "in-progress": "badge-inprog", "resolved": "badge-resolved", "pending": "badge-pending", "escalated": "badge-escalated" }[status] || "badge-pending";
}

// ── Render messages ────────────────────────────────────
function renderMessages(cmpId) {
  const messages = getMessages(cmpId);
  const container = document.getElementById("chatMessages");
  container.innerHTML = "";

  // Date divider
  const divider = document.createElement("div");
  divider.className   = "date-divider";
  divider.textContent = "Today";
  container.appendChild(divider);

  messages.forEach(msg => {
    container.appendChild(buildBubble(msg));
  });

  scrollToBottom();
}

function buildBubble(msg) {
  if (msg.type === "status") {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:center;margin:4px 0;";
    row.innerHTML = `
      <div class="msg-bubble status-update">
        <svg viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" width="14" height="14"><polyline points="20,6 9,17 4,12"/></svg>
        ${msg.text}
      </div>`;
    return row;
  }

  // Determine sent vs received based on role
  const isSent = IS_EMPLOYEE ? (msg.from === "employee") : (msg.from === "citizen");

  const row = document.createElement("div");
  row.className = "msg-row " + (isSent ? "sent" : "recv");

  if (!isSent) {
    const sender = document.createElement("div");
    sender.className   = "msg-sender";
    sender.textContent = msg.name;
    row.appendChild(sender);
  }

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  if (msg.type === "photo") {
    bubble.innerHTML = `<div class="msg-photo-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" width="28" height="28" style="display:block;margin:0 auto 6px;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
      Photo: ${msg.text}
    </div>`;
  } else {
    bubble.textContent = msg.text;
  }
  row.appendChild(bubble);

  const time = document.createElement("div");
  time.className   = "msg-time";
  time.textContent = msg.time;
  row.appendChild(time);

  return row;
}

// ── Send message ───────────────────────────────────────
function sendMessage() {
  const input = document.getElementById("chatInput");
  const text  = input.value.trim();
  if (!text || !activeCmpId) return;

  const userName = IS_EMPLOYEE ? "Suresh Kumar" : "Priya Patel";
  const msg = {
    from: IS_EMPLOYEE ? "employee" : "citizen",
    name: userName,
    text, type: "text",
    time: getCurrentTime()
  };

  const messages = getMessages(activeCmpId);
  messages.push(msg);
  saveMessages(activeCmpId, messages);

  // Render new bubble immediately
  const container = document.getElementById("chatMessages");
  container.appendChild(buildBubble(msg));
  scrollToBottom();

  // Update sidebar preview
  updateConvPreview(activeCmpId, text);

  input.value = "";

  // Simulate typing + auto-reply after delay
  simulateReply();
}

function sendQuick(text) {
  document.getElementById("chatInput").value = text;
  sendMessage();
}

// ── Attach photo ───────────────────────────────────────
function attachPhoto(input) {
  if (!input.files.length || !activeCmpId) return;
  const file = input.files[0];
  const msg  = {
    from: IS_EMPLOYEE ? "employee" : "citizen",
    name: IS_EMPLOYEE ? "Suresh Kumar" : "Priya Patel",
    text: file.name,
    type: "photo",
    time: getCurrentTime()
  };

  const messages = getMessages(activeCmpId);
  messages.push(msg);
  saveMessages(activeCmpId, messages);

  const container = document.getElementById("chatMessages");
  container.appendChild(buildBubble(msg));
  scrollToBottom();
  input.value = "";
}

// ── Handle Enter key ───────────────────────────────────
function handleKey(e) {
  if (e.key === "Enter") sendMessage();
}

// ── Simulate typing + auto-reply ──────────────────────
const AUTO_REPLIES_EMPLOYEE = [
  "Thank you for the update. I will look into it.",
  "I will visit the site and provide an update soon.",
  "Understood. We are working on it.",
  "I have noted your concern. Work is in progress.",
  "I will escalate this if needed. Please stay patient.",
];
const AUTO_REPLIES_CITIZEN = [
  "Thank you for the update.",
  "When can I expect the issue to be resolved?",
  "Okay, I will wait for your visit.",
  "Please hurry, the problem is getting worse.",
  "I appreciate your response.",
];

function simulateReply() {
  if (!activeCmpId) return;
  const indicator = document.getElementById("typingIndicator");

  setTimeout(() => {
    indicator.style.display = "flex";
    scrollToBottom();
  }, 1000);

  setTimeout(() => {
    indicator.style.display = "none";

    const replies = IS_EMPLOYEE ? AUTO_REPLIES_CITIZEN : AUTO_REPLIES_EMPLOYEE;
    const replyText = replies[Math.floor(Math.random() * replies.length)];
    const replyFrom = IS_EMPLOYEE ? "citizen" : "employee";
    const replyName = IS_EMPLOYEE ? activeContact.name : activeContact.name;

    const reply = { from: replyFrom, name: replyName, text: replyText, type: "text", time: getCurrentTime() };

    const messages = getMessages(activeCmpId);
    messages.push(reply);
    saveMessages(activeCmpId, messages);

    const container = document.getElementById("chatMessages");
    container.appendChild(buildBubble(reply));
    scrollToBottom();
    updateConvPreview(activeCmpId, replyText);

  }, 3000);
}

// ── Filter sidebar conversations ───────────────────────
function filterConversations() {
  const q = document.getElementById("convSearch").value.toLowerCase();
  document.querySelectorAll(".conv-item").forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(q) ? "" : "none";
  });
}

// ── Helpers ───────────────────────────────────────────
function getCurrentTime() {
  const d = new Date();
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return h + ":" + (m < 10 ? "0" + m : m) + " " + ampm;
}

function scrollToBottom() {
  const el = document.getElementById("chatMessages");
  if (el) el.scrollTop = el.scrollHeight;
}

function updateConvPreview(cmpId, text) {
  const conv = document.getElementById("conv-" + cmpId);
  if (!conv) return;
  const preview = conv.querySelector(".conv-preview");
  if (preview) preview.textContent = text.length > 36 ? text.substring(0, 36) + "..." : text;
  const timeEl = conv.querySelector(".conv-time");
  if (timeEl) timeEl.textContent = getCurrentTime();
}

// ── Init: open first conversation ─────────────────────
window.addEventListener("DOMContentLoaded", function () {
  if (IS_EMPLOYEE) {
    openChat("CMP-002", "Priya Patel", "Pothole near school zone", "CMP-002", "emp");
  } else {
    openChat("CMP-002", "Suresh Kumar", "Roads & PWD", "CMP-002");
  }

  // Check URL param for direct open: chat.html?cmp=CMP-003
  const params = new URLSearchParams(window.location.search);
  const cmp    = params.get("cmp");
  if (cmp) {
    const convEl = document.getElementById("conv-" + cmp.replace("-", "-"));
    if (convEl) convEl.click();
  }
});
