/**
 * login.js — Shared login utilities v2.1
 * FIX: Stores session data with all fields needed by citizen.js, employee.js, chat.js
 */

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show = input.type === 'password';
  input.type    = show ? 'text' : 'password';
  btn.textContent = show ? 'Hide' : 'Show';
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  if (!el) return;
  el.textContent    = msg;
  el.style.display  = 'block';
}

function clearError() {
  const el = document.getElementById('errorMsg');
  if (el) el.style.display = 'none';
}

function otpNext(input, index) {
  if (input.value.length === 1) {
    const boxes = document.querySelectorAll('.otp-box');
    if (index + 1 < boxes.length) boxes[index + 1].focus();
  }
}

// FIX: requireAuth ensures session has correct role
function requireAuth(role) {
  const user = JSON.parse(sessionStorage.getItem('crm_user') || '{}');
  if (!user.role) {
    window.location.href = 'index.html';
    return null;
  }
  if (role && user.role !== role) {
    window.location.href = 'index.html';
    return null;
  }
  return user;
}
