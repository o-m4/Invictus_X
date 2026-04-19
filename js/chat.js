/**
 * chat.js — Real Two-Way Chat v2.1
 *
 * FIX: Replaced pure localStorage system with backend API calls.
 * Messages are stored in the 'messages' DB table via POST /api/chat/send.
 * Incremental polling via GET /api/chat/{cid}/messages?since_id=N.
 * localStorage retained only as an offline/fallback layer.
 * Cross-tab sync now works through both backend polling AND storage events.
 */

const CHAT_API  = 'http://localhost:8000';
const ROLE      = window.CHAT_ROLE || 'citizen';  // 'citizen' | 'employee'

// FIX: Get sender name from session storage (set at login) with fallbacks
function _getSenderName() {
  const user = JSON.parse(sessionStorage.getItem('crm_user') || '{}');
  if (user.name) return user.name;
  return ROLE === 'employee' ? 'Officer' : 'Citizen';
}

// ── Conversation list (loaded dynamically from backend) ──
let CONVERSATIONS   = {};   // populated from API
let activeCid       = null;
let lastMsgId       = 0;    // FIX: track last fetched message ID per conversation
let msgPollTimer    = null;
const msgPollMs     = 3000; // poll for new messages every 3s

// ── Init ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await _loadConversations();
  buildSidebar();

  // Auto-open from URL param or first conversation
  const params = new URLSearchParams(window.location.search);
  const cmpParam = params.get('cmp');

  // FIX: If URL has ?cmp= that's not in CONVERSATIONS, create a placeholder
  if (cmpParam && !CONVERSATIONS[cmpParam]) {
    CONVERSATIONS[cmpParam] = _makePlaceholderConv(cmpParam);
    buildSidebar();
  }

  const firstCid = cmpParam || Object.keys(CONVERSATIONS)[0];
  if (firstCid) openConv(firstCid);

  // Input listeners
  const msgInput = document.getElementById('msgInput');
  if (msgInput) {
    msgInput.addEventListener('input',   onTyping);
    msgInput.addEventListener('keydown', onKey);
  }

  // Cross-tab sync via storage event (offline fallback)
  window.addEventListener('storage', e => {
    if (e.key === 'rchat_lastmsg' && e.newValue) {
      try {
        const info = JSON.parse(e.newValue);
        if (info.cid === activeCid) _fetchNewMessages(activeCid);
        else _updateUnreadBadge(info.cid);
      } catch {}
    }
  });
});

// ── Load conversations from backend ───────────────────
async function _loadConversations() {
  // FIX: Fetch from backend based on role
  const user = JSON.parse(sessionStorage.getItem('crm_user') || '{}');
  try {
    let url;
    if (ROLE === 'employee') {
      const empId = user.id || 'EMP-02';
      url = `${CHAT_API}/api/chat/conversations/employee/${empId}`;
    } else {
      const phone = user.phone || sessionStorage.getItem('citizen_phone') || '9800000001';
      url = `${CHAT_API}/api/chat/conversations/citizen/${phone}`;
    }
    const res  = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      data.forEach(c => {
        CONVERSATIONS[c.id] = {
          cid:             c.id,
          title:           (c.description || '').substring(0, 45),
          dept:            c.category || '',
          sla:             c.sla_deadline || '—',
          status:          c.status || 'pending',
          employeeName:    c.assigned_to || 'Officer',
          employeeInitial: (c.assigned_to || 'O').charAt(0).toUpperCase(),
          citizenName:     c.name || 'Citizen',
          citizenInitial:  (c.name || 'C').charAt(0).toUpperCase(),
          avatarClass:     _avatarClass(c.id),
          unreadCount:     c.unread_count || 0,
          lastMessage:     c.last_message || '',
          lastMessageTime: c.last_message_time || '',
          priority:        c.priority || 'medium',
        };
      });
    }
  } catch (err) {
    console.warn('Could not load conversations from backend:', err);
  }

  // FIX: If still empty, use hardcoded seed data so the page isn't blank
  if (!Object.keys(CONVERSATIONS).length) {
    _seedFallbackConversations();
  }
}

function _makePlaceholderConv(cid) {
  return {
    cid, title: cid, dept: '', sla: '—', status: 'pending',
    employeeName: 'Officer', employeeInitial: 'O',
    citizenName: 'Citizen', citizenInitial: 'C',
    avatarClass: 'av-blue', unreadCount: 0,
    lastMessage: '', lastMessageTime: '',
  };
}

function _seedFallbackConversations() {
  // Minimal fallback so the page isn't blank when backend is offline
  const seeds = [
    { cid:'CMP-002', title:'Pothole near school zone',         dept:'Roads & PWD',   sla:'—', status:'in-progress', eN:'Suresh Kumar', eI:'S', cN:'Priya Patel',   cI:'P', av:'av-blue'   },
    { cid:'CMP-003', title:'Garbage not collected',           dept:'Sanitation',    sla:'—', status:'pending',     eN:'Ravi Singh',   eI:'R', cN:'Anita Gupta',   cI:'A', av:'av-green'  },
    { cid:'CMP-004', title:'Water supply disruption',         dept:'Water Supply',  sla:'—', status:'in-progress', eN:'Deepak Yadav', eI:'D', cN:'Vikram Joshi',  cI:'V', av:'av-orange' },
    { cid:'CMP-005', title:'Street dog menace near park',     dept:'Animal Control',sla:'—', status:'pending',     eN:'Kavita Sharma',eI:'K', cN:'Sunita Mehta',  cI:'S', av:'av-purple' },
    { cid:'CMP-006', title:'Illegal construction blocking road',dept:'Enforcement', sla:'—', status:'escalated',   eN:'Inspector Kaur',eI:'K',cN:'Mohan Das',     cI:'M', av:'av-red'    },
  ];
  seeds.forEach(s => {
    CONVERSATIONS[s.cid] = {
      cid: s.cid, title: s.title, dept: s.dept, sla: s.sla, status: s.status,
      employeeName: s.eN, employeeInitial: s.eI,
      citizenName: s.cN, citizenInitial: s.cI,
      avatarClass: s.av, unreadCount: 0, lastMessage: '', lastMessageTime: '',
    };
  });
}

function _avatarClass(cid) {
  const classes = ['av-blue','av-green','av-orange','av-purple','av-red'];
  const sum     = [...(cid||'')].reduce((a,c) => a + c.charCodeAt(0), 0);
  return classes[sum % classes.length];
}

// ── Build sidebar ──────────────────────────────────────
function buildSidebar() {
  const list = document.getElementById('convList');
  if (!list) return;
  list.innerHTML = '';
  Object.values(CONVERSATIONS).forEach(conv => {
    const contactName = ROLE === 'employee' ? conv.citizenName : conv.employeeName;
    const initial     = ROLE === 'employee' ? conv.citizenInitial : conv.employeeInitial;
    const unread      = conv.unreadCount || 0;
    const lastMsg     = conv.lastMessage || 'No messages yet';

    const el = document.createElement('div');
    el.className = 'conv-item' + (conv.cid === activeCid ? ' active' : '');
    el.id        = 'conv-' + conv.cid;
    el.onclick   = () => openConv(conv.cid);
    el.innerHTML = `
      <div class="conv-avatar ${conv.avatarClass}">${initial}</div>
      <div class="conv-body">
        <div class="conv-name">${escHtml(contactName)}</div>
        <div class="conv-last" id="clast-${conv.cid}">${escHtml(lastMsg.substring(0,45))}</div>
        <div class="conv-cid">${conv.cid} &mdash; ${escHtml(conv.title.substring(0,30))}</div>
      </div>
      <div class="conv-right">
        <div class="conv-time" id="ctime-${conv.cid}">${conv.lastMessageTime ? formatTime(new Date(conv.lastMessageTime).getTime()) : ''}</div>
        <div class="conv-badge ${unread === 0 ? 'hidden' : ''}" id="cbadge-${conv.cid}">${unread || ''}</div>
      </div>`;
    list.appendChild(el);
  });
}

// ── Open a conversation ────────────────────────────────
async function openConv(cid) {
  // Stop polling previous conversation
  clearInterval(msgPollTimer);
  lastMsgId = 0;

  activeCid = cid;

  // Sidebar active
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  const convEl = document.getElementById('conv-' + cid);
  if (convEl) convEl.classList.add('active');

  const badge = document.getElementById('cbadge-' + cid);
  if (badge) badge.classList.add('hidden');

  const conv = CONVERSATIONS[cid] || _makePlaceholderConv(cid);

  // Update topbar
  const contactName = ROLE === 'employee' ? conv.citizenName : conv.employeeName;
  const initial     = ROLE === 'employee' ? conv.citizenInitial : conv.employeeInitial;
  document.getElementById('topbarAvatar').textContent = initial;
  document.getElementById('topbarName').textContent   = contactName;
  document.getElementById('topbarSub').textContent    = cid + ' — ' + conv.title;

  // Info strip
  document.getElementById('infoStatus').textContent = (conv.status||'pending').replace('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
  document.getElementById('infoSla').textContent    = conv.sla || '—';
  document.getElementById('infoDept').textContent   = conv.dept || '—';

  renderQuickChips();

  // FIX: Load all messages from backend
  await _loadMessages(cid);

  // Mark as read
  try {
    await fetch(`${CHAT_API}/api/chat/${cid}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: ROLE }),
    });
    // Reset unread in local conv obj
    if (CONVERSATIONS[cid]) CONVERSATIONS[cid].unreadCount = 0;
  } catch {}

  // FIX: Start polling for new messages in this conversation
  msgPollTimer = setInterval(() => _fetchNewMessages(cid), msgPollMs);

  document.getElementById('msgInput')?.focus();
}

// ── Load ALL messages for a conversation ───────────────
async function _loadMessages(cid) {
  const area = document.getElementById('messagesArea');
  area.innerHTML = '';
  lastMsgId = 0;

  try {
    const res = await fetch(`${CHAT_API}/api/chat/${cid}/messages?since_id=0`);
    if (res.ok) {
      const data = await res.json();
      const msgs = data.messages || [];
      if (msgs.length === 0) {
        _showEmptyState(area);
      } else {
        let lastDate = '';
        msgs.forEach(msg => {
          const msgDate = _dateLabel(msg.created_at);
          if (msgDate !== lastDate) { area.appendChild(_makeDateSep(msgDate)); lastDate = msgDate; }
          area.appendChild(_buildBubble(_backendMsgToLocal(msg)));
          lastMsgId = Math.max(lastMsgId, msg.id);
        });
      }
    } else {
      _showEmptyState(area);
    }
  } catch {
    // Fallback to localStorage
    const stored = _loadLocalMsgs(cid);
    if (stored.length) {
      let lastDate = '';
      stored.forEach(msg => {
        const msgDate = _dateLabel(msg.ts);
        if (msgDate !== lastDate) { area.appendChild(_makeDateSep(msgDate)); lastDate = msgDate; }
        area.appendChild(_buildBubble(msg));
      });
    } else {
      _showEmptyState(area);
    }
  }
  scrollBottom();
}

// ── Fetch only NEW messages (incremental) ─────────────
async function _fetchNewMessages(cid) {
  if (!cid || cid !== activeCid) return;
  try {
    const res = await fetch(`${CHAT_API}/api/chat/${cid}/messages?since_id=${lastMsgId}`);
    if (!res.ok) return;
    const data = await res.json();
    const msgs = data.messages || [];
    if (!msgs.length) return;

    const area = document.getElementById('messagesArea');
    // Remove empty state placeholder if present
    const placeholder = area.querySelector('[data-empty]');
    if (placeholder) area.removeChild(placeholder);

    msgs.forEach(msg => {
      // Avoid rendering duplicate messages
      if (msg.id <= lastMsgId) return;
      area.appendChild(_buildBubble(_backendMsgToLocal(msg)));
      lastMsgId = Math.max(lastMsgId, msg.id);
      // Also save to localStorage for offline access
      _appendLocalMsg(cid, _backendMsgToLocal(msg));
    });
    scrollBottom();

    // Update sidebar preview
    if (msgs.length) {
      const last = msgs[msgs.length - 1];
      _updateSidebarPreview(cid, last.message_text, new Date(last.created_at).getTime());
    }
  } catch {}
}

// FIX: Convert backend message shape to local shape
function _backendMsgToLocal(msg) {
  return {
    id:         msg.id,
    cid:        msg.complaint_id,
    from:       msg.sender_role,     // 'citizen' | 'employee'
    senderName: msg.sender_name,
    text:       msg.message_text,
    type:       msg.message_type || 'text',
    ts:         new Date(msg.created_at).getTime(),
    read:       msg.read_by_other === 1,
  };
}

// ── Send a message ─────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('msgInput');
  const text  = input?.value.trim();
  if (!text || !activeCid) return;

  const senderName = _getSenderName();

  // Optimistic local render
  const localMsg = {
    id:         Date.now(),
    cid:        activeCid,
    from:       ROLE,
    senderName: senderName,
    text:       text,
    type:       'text',
    ts:         Date.now(),
    read:       false,
  };
  const area = document.getElementById('messagesArea');
  const placeholder = area.querySelector('[data-empty]');
  if (placeholder) area.removeChild(placeholder);
  area.appendChild(_buildBubble(localMsg));
  scrollBottom();
  input.value = '';
  input.focus();
  broadcastTyping(false);

  // FIX: Send to backend
  try {
    const res = await fetch(`${CHAT_API}/api/chat/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaint_id: activeCid,
        sender_role:  ROLE,
        sender_name:  senderName,
        message_text: text,
        message_type: 'text',
      }),
    });
    if (res.ok) {
      const saved = await res.json();
      // FIX: Update lastMsgId so we don't double-fetch our own message
      lastMsgId = Math.max(lastMsgId, saved.id);
    }
  } catch {
    // Offline fallback — save to localStorage only
    _appendLocalMsg(activeCid, localMsg);
  }

  _updateSidebarPreview(activeCid, text, localMsg.ts);
  // Notify other tabs
  localStorage.setItem('rchat_lastmsg', JSON.stringify({ cid: activeCid, ts: localMsg.ts }));
}

function sendQuick(text) {
  document.getElementById('msgInput').value = text;
  sendMessage();
}

// ── Photo attachment ───────────────────────────────────
async function attachPhoto(input) {
  if (!input.files.length || !activeCid) return;
  const file       = input.files[0];
  const senderName = _getSenderName();

  const msg = {
    id: Date.now(), cid: activeCid, from: ROLE,
    senderName, text: file.name, type: 'photo', ts: Date.now(), read: false,
  };
  const area = document.getElementById('messagesArea');
  area.appendChild(_buildBubble(msg));
  scrollBottom();

  try {
    await fetch(`${CHAT_API}/api/chat/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaint_id: activeCid, sender_role: ROLE,
        sender_name: senderName, message_text: '[Photo] ' + file.name,
        message_type: 'photo',
      }),
    });
  } catch { _appendLocalMsg(activeCid, msg); }

  _updateSidebarPreview(activeCid, '[Photo] ' + file.name, msg.ts);
  input.value = '';
}

// ── Build a message bubble ─────────────────────────────
function _buildBubble(msg) {
  if (msg.type === 'status') {
    const pill = document.createElement('div');
    pill.className = 'status-pill';
    pill.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" width="14" height="14"><polyline points="20,6 9,17 4,12"/></svg> ${escHtml(msg.text)}`;
    return pill;
  }

  const isMine = (msg.from === ROLE);
  const row    = document.createElement('div');
  row.className = 'msg-row ' + (isMine ? 'me' : 'them');

  if (!isMine) {
    const nameEl = document.createElement('div');
    nameEl.className   = 'msg-name';
    nameEl.textContent = msg.senderName || '';
    row.appendChild(nameEl);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  if (msg.type === 'photo') {
    bubble.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
      <span>${escHtml(msg.text)}</span>
    </div>`;
  } else {
    bubble.textContent = msg.text;
  }
  row.appendChild(bubble);

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = formatTime(msg.ts)
    + (isMine ? ` <span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="4,12 8,16 16,8"/>${msg.read ? '<polyline points="8,12 12,16 20,8"/>' : ''}</svg></span>` : '');
  row.appendChild(meta);

  return row;
}

// ── Typing indicator ───────────────────────────────────
let typingTimer = null;
function onTyping() {
  if (!activeCid) return;
  localStorage.setItem('rchat_typing_' + ROLE + '_' + activeCid, Date.now().toString());
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    localStorage.removeItem('rchat_typing_' + ROLE + '_' + activeCid);
  }, 2000);
}

function broadcastTyping(isTyping) {
  if (!activeCid) return;
  if (isTyping) {
    localStorage.setItem('rchat_typing_' + ROLE + '_' + activeCid, Date.now().toString());
  } else {
    localStorage.removeItem('rchat_typing_' + ROLE + '_' + activeCid);
  }
}

setInterval(() => {
  if (!activeCid) return;
  const otherRole = ROLE === 'employee' ? 'citizen' : 'employee';
  const ts        = parseInt(localStorage.getItem('rchat_typing_' + otherRole + '_' + activeCid) || '0');
  const indicator = document.getElementById('typingIndicator');
  if (!indicator) return;
  if (ts && Date.now() - ts < 2500) {
    indicator.style.display = 'flex';
    scrollBottom();
  } else {
    indicator.style.display = 'none';
  }
}, 500);

// ── Quick chips ────────────────────────────────────────
function renderQuickChips() {
  const bar   = document.getElementById('quickBar');
  if (!bar) return;
  const chips = ROLE === 'employee'
    ? ['I have received your complaint.', 'I will visit the site shortly.', 'Work is now in progress.', 'Issue has been resolved.', 'Please share the exact location.', 'I need 1-2 more days.']
    : ['What is the current status?', 'When will it be resolved?', 'The issue is still not fixed.', 'Thank you for the update.', 'Can you please hurry?', 'The problem is getting worse.'];
  bar.innerHTML = chips.map(c =>
    `<button class="qchip" onclick="sendQuick(${JSON.stringify(c)})">${c}</button>`
  ).join('');
}

// ── Sidebar search ─────────────────────────────────────
function filterConvs() {
  const q = (document.getElementById('convSearch')?.value || '').toLowerCase();
  document.querySelectorAll('.conv-item').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ── Sidebar preview update ─────────────────────────────
function _updateSidebarPreview(cid, text, ts) {
  const lastEl = document.getElementById('clast-' + cid);
  const timeEl = document.getElementById('ctime-' + cid);
  if (lastEl) lastEl.textContent = text.substring(0, 45);
  if (timeEl) timeEl.textContent = formatTime(ts);
}

// FIX: Added for backward compat
function updateSidebarPreview(cid, text, ts) { _updateSidebarPreview(cid, text, ts); }

function _updateUnreadBadge(cid) {
  const badge = document.getElementById('cbadge-' + cid);
  if (!badge) return;
  const conv = CONVERSATIONS[cid];
  if (conv) conv.unreadCount = (conv.unreadCount || 0) + 1;
  badge.textContent = (conv?.unreadCount || 1).toString();
  badge.classList.remove('hidden');
}

// ── Enter key ──────────────────────────────────────────
function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

// ── LocalStorage fallback helpers ─────────────────────
function _loadLocalMsgs(cid) {
  try { return JSON.parse(localStorage.getItem('rchat_msgs_' + cid) || '[]'); }
  catch { return []; }
}
function _appendLocalMsg(cid, msg) {
  const msgs = _loadLocalMsgs(cid);
  msgs.push(msg);
  localStorage.setItem('rchat_msgs_' + cid, JSON.stringify(msgs.slice(-200)));
}

// ── Utilities ──────────────────────────────────────────
function _showEmptyState(area) {
  const el = document.createElement('div');
  el.setAttribute('data-empty', '1');
  el.style.cssText = 'text-align:center;color:#94a3b8;font-size:.85rem;margin-top:40px;';
  el.textContent   = 'No messages yet. Send a message to start the conversation.';
  area.appendChild(el);
}

function _makeDateSep(label) {
  const el = document.createElement('div');
  el.className   = 'date-sep';
  el.textContent = label;
  return el;
}

function _dateLabel(tsOrStr) {
  const d    = typeof tsOrStr === 'number' ? new Date(tsOrStr) : new Date(tsOrStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yest  = new Date(); yest.setDate(yest.getDate()-1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function scrollBottom() {
  const area = document.getElementById('messagesArea');
  if (area) area.scrollTop = area.scrollHeight;
}

function formatTime(ts) {
  const d  = new Date(ts);
  let h    = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h        = h % 12 || 12;
  return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
