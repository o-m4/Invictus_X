// login.js — Shared login utilities

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "Hide";
  } else {
    input.type = "password";
    btn.textContent = "Show";
  }
}

function showError(msg) {
  const el = document.getElementById("errorMsg");
  if (el) {
    el.textContent = msg;
    el.style.display = "block";
  }
}

function clearError() {
  const el = document.getElementById("errorMsg");
  if (el) el.style.display = "none";
}

// OTP box auto-advance
function otpNext(input, index) {
  if (input.value.length === 1) {
    const boxes = document.querySelectorAll(".otp-box");
    if (index < boxes.length - 1) {
      boxes[index + 1].focus();
    }
  }
}

// Guard pages — redirect to login if not logged in
function requireAuth(role) {
  const user = JSON.parse(sessionStorage.getItem("crm_user") || "null");
  if (!user || user.role !== role) {
    const redirectMap = {
      citizen:  "login-citizen.html",
      employee: "login-employee.html",
      admin:    "login-admin.html",
    };
    window.location.href = redirectMap[role] || "index.html";
  }
  return user;
}
