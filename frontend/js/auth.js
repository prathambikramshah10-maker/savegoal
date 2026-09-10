/* ============================================================
   SaveGoal - Authentication Logic
   ============================================================ */

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
      setAuth(data.token, data.user);
      showToast('Welcome back, ' + data.user.name + '!', 'success');
      const role = data.user.role || 'user';
      window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
    } catch (err) {
      showFormError(errorEl, err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}

function initRegisterForm(form) {
  if (redirectIfAuth()) return;

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
