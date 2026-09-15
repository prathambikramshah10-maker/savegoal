/* ============================================================
   SaveGoal - Authentication Logic
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');

  if (loginForm) initLoginForm(loginForm);
  if (registerForm) initRegisterForm(registerForm);
});

/* ============================================================
   Two-step sign-in: password first, then verification code
   ============================================================ */

let otpCountdownTimer = null;
let loginEmail = null;

function getOtpErrorEl() {
  return document.querySelector('.form-error-global');
}

function initLoginForm(form) {
  if (redirectIfAuth()) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const errorEl = form.querySelector('.form-error-global');
    const email = form.querySelector('#email').value.trim();
    const password = form.querySelector('#password').value;
    const btn = form.querySelector('button[type="submit"]');

    if (!email || !password) {
      showFormError(errorEl, 'Please fill in both email and password');
      return;
    }

    hideFormError(errorEl);
    setLoading(btn, true);

    try {
      const data = await api.post('/auth/login', { email, password });
      loginEmail = email;
      document.getElementById('otpStep2').style.display = 'block';
      form.style.display = 'none';
      document.getElementById('otpCode').value = '';

      if (data.devCode) {
        showFormInfo('Dev mode (email not configured): your code is <strong>' + data.devCode + '</strong>');
      } else {
        showFormInfo('Password correct! A verification code was sent to <strong>' + email + '</strong>. Check your inbox — it expires in 5 minutes.');
      }

      startOtpCountdown(data.cooldownMs ? Math.ceil(data.cooldownMs / 1000) : 60, data.expiresInMin || 5);
    } catch (err) {
      showFormError(errorEl, err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}

async function handleVerifyOtp() {
  const errorEl = getOtpErrorEl();
  hideFormError(errorEl);

  const email = (loginEmail || '').trim();
  const code = document.getElementById('otpCode').value.trim();

  if (!email) {
    showFormError(errorEl, 'Session expired. Please sign in again.');
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    showFormError(errorEl, 'Enter the 6-digit code from your email');
    return;
  }

  const btn = document.getElementById('verifyOtpBtn');
  setLoading(btn, true);

  try {
    const data = await api.post('/auth/otp/verify', { email, code });
    setAuth(data.token, data.user);
    stopOtpCountdown();
    showToast(data.message || 'Signed in successfully!', 'success');
    const role = data.user.role || 'user';
    window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
  } catch (err) {
    showFormError(errorEl, err.message);
  } finally {
    setLoading(btn, false);
  }
}

async function handleResendOtp() {
  const errorEl = getOtpErrorEl();
  hideFormError(errorEl);

  const email = (loginEmail || document.getElementById('email').value.trim());
  if (!email) {
    showFormError(errorEl, 'Please enter your email');
    return;
  }

  const btn = document.getElementById('resendOtpBtn');
  setLoading(btn, true);

  try {
    const data = await api.post('/auth/otp/send', { email });
    if (data.devCode) {
      showFormInfo('Dev mode (email not configured): your code is <strong>' + data.devCode + '</strong>');
    } else {
      showFormInfo('A new verification code was sent to <strong>' + email + '</strong>.');
    }
    startOtpCountdown(data.cooldownMs ? Math.ceil(data.cooldownMs / 1000) : 60, data.expiresInMin || 5);
  } catch (err) {
    if (err.cooldownMs) {
      startOtpCountdown(Math.ceil(err.cooldownMs / 1000));
      showFormInfo('Too many requests. Try again after the countdown.');
    }
    showFormError(errorEl, err.message);
  } finally {
    setLoading(btn, false);
  }
}

function resetOtpPanel() {
  stopOtpCountdown();
  const form = document.getElementById('loginForm');
  form.style.display = '';
  document.getElementById('otpStep2').style.display = 'none';
  document.getElementById('otpCode').value = '';
  loginEmail = null;
  hideFormError(getOtpErrorEl());
}

function startOtpCountdown(seconds, expiresInMin) {
  stopOtpCountdown();

  const countdownEl = document.getElementById('otpCountdown');
  const resendBtn = document.getElementById('resendOtpBtn');
  countdownEl.textContent = `Resend in ${seconds}s`;
  resendBtn.disabled = true;
  resendBtn.textContent = 'Resend Code';

  otpCountdownTimer = setInterval(() => {
    seconds -= 1;
    if (seconds <= 0) {
      stopOtpCountdown();
      countdownEl.textContent = '';
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend Code';
      if (expiresInMin) {
        showFormInfo('The code is still valid. Available again now.');
      }
      return;
    }
    countdownEl.textContent = `Resend in ${seconds}s`;
  }, 1000);
}

function stopOtpCountdown() {
  if (otpCountdownTimer) {
    clearInterval(otpCountdownTimer);
    otpCountdownTimer = null;
  }
}

function showFormInfo(msg) {
  const info = document.getElementById('otpStatus') || getOtpErrorEl();
  info.innerHTML = msg;
  info.style.color = 'var(--champagne)';
  info.style.display = 'block';
}

function updatePasswordStrength(password) {
  const fill = document.getElementById('pwMeterFill');
  const label = document.getElementById('pwMeterLabel');
  if (!fill || !label) return;

  if (!password) {
    fill.style.width = '0%';
    label.textContent = '';
    return;
  }

  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  score = Math.min(score, 5);

  const levels = [
    { min: 4, color: '#4CAF50', text: 'Strong' },
    { min: 3, color: '#d19a2a', text: 'Medium' },
    { min: 2, color: '#e67e22', text: 'Weak' },
    { min: 0, color: '#C44D4D', text: 'Too weak' }
  ];
  const level = levels.find((l) => score >= l.min);
  fill.style.width = (score / 5) * 100 + '%';
  fill.style.backgroundColor = level.color;
  label.textContent = level.text;
  label.style.color = level.color;
}

function initRegisterForm(form) {
  if (redirectIfAuth()) return;

  const pwInput = form.querySelector('#password');
  if (pwInput) {
    pwInput.addEventListener('input', (e) => updatePasswordStrength(e.target.value));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const errorEl = form.querySelector('.form-error-global');
    const name = form.querySelector('#name').value.trim();
    const email = form.querySelector('#email').value.trim();
    const phone = form.querySelector('#phone').value.trim();
    const password = form.querySelector('#password').value;
    const confirmPassword = form.querySelector('#confirmPassword').value;
    const btn = form.querySelector('button[type="submit"]');

    hideFormError(errorEl);

    if (!name || !email || !phone || !password || !confirmPassword) {
      showFormError(errorEl, 'Please fill in all fields');
      return;
    }
    if (name.length < 2) {
      showFormError(errorEl, 'Name must be at least 2 characters');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      showFormError(errorEl, 'Please enter a valid email');
      return;
    }
    if (password.length < 6) {
      showFormError(errorEl, 'Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      showFormError(errorEl, 'Passwords do not match');
      return;
    }

    setLoading(btn, true);

    try {
      const data = await api.post('/auth/register', { name, email, phone, password });
      setAuth(data.token, data.user);
      showToast('Account created! Welcome to SaveGoal!', 'success');
      const role = data.user.role || 'user';
      window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
    } catch (err) {
      showFormError(errorEl, err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}

function showFormError(el, msg) {
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

function hideFormError(el) {
  if (el) {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    btn.disabled = false;
  }
}
