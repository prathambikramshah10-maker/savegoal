/* ============================================================
   SaveGoal - Authentication Logic
   ============================================================ */

let pendingRegister = null;
let pendingLogin = null;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if (loginForm) initLoginForm(loginForm);
  if (registerForm) initRegisterForm(registerForm);
});

function initLoginForm(form) {
  if (redirectIfAuth()) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const errorEl = form.querySelector('.form-error-global');

    if (pendingLogin) {
      await submitLoginOtp(form, errorEl);
      return;
    }

    const email = form.querySelector('#email').value.trim();
    const password = form.querySelector('#password').value;
    const btn = form.querySelector('button[type="submit"]');

    if (!email || !password) {
      showFormError(errorEl, 'Please fill in all fields');
      return;
    }

    setLoading(btn, true);
    hideFormError(errorEl);

    try {
      const data = await api.post('/auth/login', { email, password });
      if (data.token && data.user) {
        setAuth(data.token, data.user);
        showToast('Welcome back, ' + data.user.name + '!', 'success');
        const role = data.user.role || 'user';
        window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
        return;
      }
      pendingLogin = { email, devCode: data.devCode };
      form.querySelector('#loginCredentials').style.display = 'none';
      form.querySelector('#loginOtp').style.display = 'block';
      form.querySelector('#otpCode').focus();
      showDevOtpHint(document.getElementById('devOtpHint'), data);
      if (data.emailConfigured) {
        showToast('Verification code sent to your email', 'info');
      } else {
        showToast('Development mode: your code is shown on this page', 'info');
      }
    } catch (err) {
      showFormError(errorEl, err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  const resend = document.getElementById('resendOtp');
  if (resend) {
    resend.addEventListener('click', async (ev) => {
      ev.preventDefault();
      if (!pendingLogin) return;
      try {
        await api.post('/auth/resend-otp', { email: pendingLogin.email, purpose: 'login' });
        showToast('A new code has been sent', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

async function submitLoginOtp(form, errorEl) {
  const code = form.querySelector('#otpCode').value.trim();
  const btn = document.getElementById('verifyOtpBtn');

  if (!code) {
    showFormError(errorEl, 'Please enter the verification code');
    return;
  }

  setLoading(btn, true);
  hideFormError(errorEl);

  try {
    const data = await api.post('/auth/verify-login', { email: pendingLogin.email, code });
    pendingLogin = null;
    setAuth(data.token, data.user);
    showToast('Welcome back, ' + data.user.name + '!', 'success');
    const role = data.user.role || data.role || 'user';
    const dest = role === 'admin' ? 'admin.html' : 'dashboard.html';
    window.location.href = dest;
  } catch (err) {
    showFormError(errorEl, err.message);
  } finally {
    setLoading(btn, false);
  }
}

function initRegisterForm(form) {
  if (redirectIfAuth()) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const errorEl = form.querySelector('.form-error-global');

    if (pendingRegister) {
      await submitRegisterOtp(form, errorEl);
      return;
    }

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
      if (data.token && data.user) {
        setAuth(data.token, data.user);
        showToast('Account created! Welcome to SaveGoal!', 'success');
        const role = data.user.role || 'user';
        window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
        return;
      }
      pendingRegister = { name, email, phone, password, devCode: data.devCode };
      form.querySelector('#registerDetails').style.display = 'none';
      form.querySelector('#registerOtp').style.display = 'block';
      form.querySelector('#regOtpCode').focus();
      showDevOtpHint(document.getElementById('devOtpHint'), data);
      if (data.emailConfigured) {
        showToast('Verification code sent to your email', 'info');
      } else {
        showToast('Development mode: your code is shown on this page', 'info');
      }
    } catch (err) {
      showFormError(errorEl, err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  const resend = document.getElementById('resendRegOtp');
  if (resend) {
    resend.addEventListener('click', async (ev) => {
      ev.preventDefault();
      if (!pendingRegister) return;
      try {
        await api.post('/auth/resend-otp', { email: pendingRegister.email, purpose: 'register' });
        showToast('A new code has been sent', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

async function submitRegisterOtp(form, errorEl) {
  const code = form.querySelector('#regOtpCode').value.trim();
  const btn = document.getElementById('verifyRegisterBtn');

  if (!code) {
    showFormError(errorEl, 'Please enter the verification code');
    return;
  }

  setLoading(btn, true);
  hideFormError(errorEl);

  try {
    const data = await api.post('/auth/verify-register', {
      ...pendingRegister,
      confirmPassword: pendingRegister.password,
      code
    });
    pendingRegister = null;
    setAuth(data.token, data.user);
    showToast('Account created! Welcome to SaveGoal!', 'success');
    const role = data.user.role || 'user';
    window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
  } catch (err) {
    showFormError(errorEl, err.message);
  } finally {
    setLoading(btn, false);
  }
}

function showDevOtpHint(el, data) {
  if (!el) return;
  if (data && data.devCode && !data.emailConfigured) {
    el.innerHTML = '<strong style="color:var(--champagne);">Development mode</strong> — real email isn\'t configured, so no code was sent. Use the code below (also printed in the backend console):<div style="font-size:1.4rem;letter-spacing:4px;font-weight:800;color:var(--champagne);margin-top:6px;">' + data.devCode + '</div>';
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
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
