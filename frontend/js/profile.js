/* ============================================================
   SaveGoal - Profile Logic
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  loadProfile();
  initProfileForm();
  initPasswordForm();
  initDeleteAccount();
});

async function loadProfile() {
  try {
    const data = await api.get('/auth/me');
    const user = data.user;

    document.getElementById('profileName').value = user.name || '';
    document.getElementById('profileEmail').value = user.email || '';
    document.getElementById('profilePhone').value = user.phone || '';
  } catch (err) {
    showToast('Error loading profile', 'error');
  }
}

function initProfileForm() {
  const form = document.getElementById('profileForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('saveProfileBtn');
    const name = document.getElementById('profileName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();

    if (!name || name.length < 2) {
      showToast('Name must be at least 2 characters', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const data = await api.put('/auth/me', { name, phone });
      setAuth(getToken(), data.user);
      showToast('Profile updated successfully', 'success');
      renderNav();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });
}

function initPasswordForm() {
  const form = document.getElementById('passwordForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('changePasswordBtn');
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;

    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      await api.put('/auth/me', { currentPassword, newPassword });
      showToast('Password updated successfully', 'success');
      form.reset();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  });
}

function initDeleteAccount() {
  const emailInput = document.getElementById('deleteConfirmEmail');
  const deleteBtn = document.getElementById('deleteAccountBtn');

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      const user = getUser();
      deleteBtn.disabled = emailInput.value !== user.email;
    });
  }
}

async function handleDeleteAccount() {
  const btn = document.getElementById('deleteAccountBtn');
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    await api.delete('/auth/me');
    clearAuth();
    showToast('Account deleted successfully', 'success');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Delete My Account';
  }
}
