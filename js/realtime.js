/**
 * realtime.js — Polling-based real-time event bus v2.1
 * FIX: Added connection status tracking, error recovery, backoff on failure.
 * FIX: Exposed isConnected flag so pages can show offline warning.
 * FIX: Added 'new_message' event type to supported events.
 */

const RT = (() => {
  const API      = 'http://localhost:8000';
  const INTERVAL = 4000;      // normal poll interval ms
  const BACKOFF  = 10000;     // retry interval after failure ms
  let lastId     = 0;
  let timer      = null;
  let handlers   = {};
  let running    = false;
  let isConnected= false;
  let failCount  = 0;

  function on(eventType, fn) {
    if (!handlers[eventType]) handlers[eventType] = [];
    // FIX: Prevent duplicate handler registration
    if (!handlers[eventType].includes(fn)) {
      handlers[eventType].push(fn);
    }
  }

  function off(eventType, fn) {
    if (!handlers[eventType]) return;
    handlers[eventType] = handlers[eventType].filter(h => h !== fn);
  }

  async function poll() {
    try {
      const res = await fetch(`${API}/api/events/poll?since_id=${lastId}`, {
        // FIX: Short timeout so slow backend doesn't block entire poll cycle
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) { _onFailure(); return; }
      const data = await res.json();

      // FIX: Update lastId even when there are no new events
      if (typeof data.latest_id === 'number') {
        lastId = data.latest_id;
      }
      (data.events || []).forEach(fire);

      // Restore connected state
      if (!isConnected) {
        isConnected = true;
        failCount   = 0;
        _fireInternal('connected', {});
      }
    } catch (_) {
      _onFailure();
    }
  }

  function _onFailure() {
    failCount++;
    if (isConnected) {
      isConnected = false;
      _fireInternal('disconnected', {});
    }
    // Backoff after 3 consecutive failures
    if (failCount >= 3 && running) {
      clearInterval(timer);
      timer = setInterval(poll, BACKOFF);
    }
  }

  function _fireInternal(type, payload) {
    (handlers[type] || []).forEach(fn => fn(payload));
  }

  function fire(event) {
    let payload = {};
    try { payload = JSON.parse(event.payload || '{}'); } catch (_) {}
    const merged = { ...payload, _type: event.event_type, _event_id: event.id };
    // FIX: Fire specific handler first, then wildcard
    (handlers[event.event_type] || []).forEach(fn => fn(merged));
    (handlers['*'] || []).forEach(fn => fn(merged));
  }

  function start() {
    if (running) return;
    running = true;
    poll();  // immediate first poll
    timer = setInterval(poll, INTERVAL);
  }

  function stop() {
    running = false;
    clearInterval(timer);
    timer = null;
  }

  /**
   * FIX: init() now correctly sets lastId to the current max event ID
   * so the page doesn't replay old events on load.
   */
  async function init() {
    try {
      const res  = await fetch(`${API}/api/events/poll?since_id=999999999`);
      if (res.ok) {
        const data = await res.json();
        lastId     = data.latest_id || 0;
        isConnected = true;
      }
    } catch (_) {
      lastId = 0;
      isConnected = false;
    }
    return lastId;
  }

  return { on, off, start, stop, init, API, get connected() { return isConnected; } };
})();
