/* ============================================================
   SaveGoal - Utility Functions
   ============================================================ */

const API_BASE = (() => {
  try {
    const { protocol, hostname, port } = window.location;
    if (protocol === 'file:') return 'http://localhost:5000/api';
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      if (port === '5000') return '/api';
      return 'http://localhost:5000/api';
    }
    return '/api';
  } catch (e) {
    return '/api';
  }
})();

/* --- API Helper --- */
const api = {
  async request(method, path, body = null) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
      const res = await fetch(`${API_BASE}${path}`, config);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        if (!res.ok) {
          throw new Error('Server error. Please try again later.');
        }
        throw new Error('Invalid response from server.');
      }

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          if (!window.location.pathname.includes('login') &&
              !window.location.pathname.includes('register') &&
              !window.location.pathname.includes('index.html')) {
            window.location.href = 'login.html';
          }
        }
        throw new Error(data.error || 'Something went wrong');
      }

      return data;
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        throw new Error('Cannot connect to server. Make sure the backend is running.');
      }
      throw err;
    }
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  delete(path) { return this.request('DELETE', path); }
};

/* --- Auth Helpers --- */
function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function redirectIfAuth() {
  if (getToken()) {
    window.location.href = 'dashboard.html';
    return true;
  }
  return false;
}

/* --- Formatting --- */
function formatNPR(amount) {
  return 'NPR ' + Number(amount).toLocaleString('en-NP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

function daysUntil(dateStr) {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  return `${diff} days left`;
}

/* --- Category Helpers --- */
const categoryImages = {
  'Emergency Fund': 'category-emergency.svg',
  'Education': 'category-education.svg',
  'Travel': 'category-travel.svg',
  'Phone': 'category-phone.svg',
  'Laptop': 'category-laptop.svg',
  'Car': 'category-car.svg',
  'House': 'category-house.svg',
  'Other': 'category-other.svg'
};

const categoryClasses = {
  'Emergency Fund': 'cat-emergency',
  'Education': 'cat-education',
  'Travel': 'cat-travel',
  'Phone': 'cat-phone',
  'Laptop': 'cat-laptop',
  'Car': 'cat-car',
  'House': 'cat-house',
  'Other': 'cat-other'
};

function getCategoryIcon(category) {
  const file = categoryImages[category] || 'category-other.svg';
  const alt = String(category).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<img src="images/${file}" alt="${alt}" class="category-img">`;
}

function getCategoryClass(category) {
  return categoryClasses[category] || 'cat-other';
}

/* --- Toast Notifications --- */
let toastContainer;

function showToast(message, type = 'info') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* --- Modal Helpers --- */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('show');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('show');
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
}

/* --- Navigation Rendering --- */
function renderNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  const user = getUser();
  const path = window.location.pathname;
  const isLanding = path.endsWith('index.html') || path.endsWith('/') || path === '';

  if (isLanding) {
    nav.innerHTML = `
      <div class="container">
        <a href="index.html" class="nav-brand">
          <div class="logo-icon">SG</div>
          SaveGoal
        </a>
        <div class="nav-links" id="navLinks">
          <a href="login.html" class="btn btn-primary">Sign In</a>
        </div>
        <button class="nav-toggle" onclick="toggleMobileNav()">
          <span></span><span></span><span></span>
        </button>
      </div>
    `;
    return;
  }

  if (!user) return;

  const initials = user.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  const isActive = (page) => path.includes(page) ? ' active' : '';
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';

  nav.className = 'nav sidebar-nav-outer';
  nav.innerHTML = `
    <div class="sidebar-inner">
      <div class="sidebar-header">
        <a href="dashboard.html" class="sidebar-brand">
          <div class="logo-icon">SG</div>
          <span>SaveGoal</span>
        </a>
      </div>
      <div class="sidebar-nav">
        <div class="sidebar-section-label">Menu</div>
        <a href="dashboard.html" class="sidebar-link${isActive('dashboard')}">
          <span class="si"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg></span>
          Dashboard
        </a>
        ${user.role === 'admin' ? `
        <a href="admin.html" class="sidebar-link${isActive('admin')}">
          <span class="si"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></span>
          Admin Panel
        </a>` : ''}
        <div class="sidebar-section-label">Account</div>
        <a href="profile.html" class="sidebar-link${isActive('profile')}">
          <span class="si"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg></span>
          Settings
        </a>
      </div>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="nav-avatar">${initials}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${user.name}</div>
            <div class="sidebar-user-email">${user.email}</div>
          </div>
          <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">
            ${dark ? '☀️' : '🌙'}
          </button>
        </div>
        <button class="sidebar-logout" onclick="handleLogout()">
          <span class="si"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg></span>
          Sign out
        </button>
      </div>
    </div>
  `;

  document.body.classList.add('has-sidebar');
  ensureSidebarChrome();
}

function ensureSidebarChrome() {
  if (document.getElementById('sidebarHamburger')) return;
  const burger = document.createElement('button');
  burger.className = 'sidebar-hamburger';
  burger.id = 'sidebarHamburger';
  burger.setAttribute('aria-label', 'Open menu');
  burger.setAttribute('onclick', 'toggleSidebar()');
  burger.innerHTML = '<span></span><span></span><span></span>';
  document.body.appendChild(burger);

  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id = 'sidebarOverlay';
  overlay.setAttribute('onclick', 'toggleSidebar()');
  document.body.appendChild(overlay);
}

function toggleSidebar() {
  const nav = document.querySelector('.nav');
  const overlay = document.getElementById('sidebarOverlay');
  if (nav) nav.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show');
}

function toggleDropdown() {
  const menu = document.getElementById('dropdownMenu');
  if (menu) menu.classList.toggle('show');
}

function toggleMobileNav() {
  const links = document.getElementById('navLinks');
  if (links) links.classList.toggle('open');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-dropdown')) {
    const menu = document.getElementById('dropdownMenu');
    if (menu) menu.classList.remove('show');
  }
});

/* --- Theme Toggle --- */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  renderNav();
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

/* --- Logout --- */
async function handleLogout() {
  try {
    await api.post('/auth/logout');
  } catch (e) { /* ignore */ }
  clearAuth();
  window.location.href = 'login.html';
}

/* --- Celebrate --- */
function celebrate() {
  const overlay = document.createElement('div');
  overlay.className = 'celebration-overlay show';

  const confetti = document.createElement('div');
  confetti.className = 'confetti-container';

  const colors = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#ec4899', '#3b82f6'];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
    piece.style.animationDelay = Math.random() * 1.5 + 's';
    piece.style.width = (Math.random() * 8 + 6) + 'px';
    piece.style.height = (Math.random() * 8 + 6) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    confetti.appendChild(piece);
  }

  overlay.innerHTML = `
    <div class="celebration-content">
      <div class="trophy">🎉</div>
      <h2>Goal Completed!</h2>
      <p>Congratulations! You've reached your savings goal!</p>
      <button class="btn btn-primary btn-lg" onclick="this.closest('.celebration-overlay').remove()">
        Continue
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(confetti);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      confetti.remove();
    }
  });
}

/* --- Export CSV --- */
function exportCSV(goalId, goalName) {
  const url = `${API_BASE}/goals/${goalId}/export`;
  const token = getToken();
  fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
    .then(res => {
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    })
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${goalName.replace(/[^a-z0-9]/gi, '_')}_transactions.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('CSV exported successfully', 'success');
    })
    .catch(err => showToast(err.message, 'error'));
}

/* --- Budget Calculator --- */
function calculateBudget(targetAmount, currentAmount, targetDate) {
  const remaining = Math.max(0, targetAmount - currentAmount);
  const now = new Date();
  const target = new Date(targetDate);
  const diffMs = target - now;
  const monthsLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30.44)));
  const weeksLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 7)));
  const daysLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const daily = remaining / daysLeft;
  const weekly = remaining / weeksLeft;
  const monthly = remaining / monthsLeft;
  return { remaining, monthsLeft, weekly: Math.round(weekly), monthly: Math.round(monthly), daily: Math.round(daily) };
}

/* --- Password visibility toggle (available on every page) --- */
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  if (btn) btn.textContent = show ? '🙈' : '👁';
  input.focus();
}

/* --- Init --- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  renderNav();
});
