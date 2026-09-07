/* ============================================================
   SaveGoal - Admin Panel Logic
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const user = getUser();
  if (user && user.role !== 'admin') {
    showToast('Admin access required', 'error');
    window.location.href = 'dashboard.html';
    return;
  }

  loadAdminOverview();
  loadAdminUsers();
});

async function loadAdminOverview() {
  try {
    const data = await api.get('/admin/overview');
    document.getElementById('statUsers').textContent = data.users;
    document.getElementById('statGoals').textContent = data.goals;
    document.getElementById('statCompleted').textContent = data.completedGoals;
    document.getElementById('statTransactions').textContent = data.transactions;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadAdminUsers() {
  const container = document.getElementById('adminUsersContainer');
  try {
    const data = await api.get('/admin/users');
    const users = data.users || [];

    if (users.length === 0) {
      container.innerHTML = `<div class="empty-state card"><h3>No users found</h3></div>`;
      return;
    }

    container.innerHTML = `
      <div class="card" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:640px;">
          <thead>
            <tr style="text-align:left;border-bottom:1px solid var(--border);font-size:0.8rem;color:var(--muted-text);text-transform:uppercase;letter-spacing:0.05em;">
              <th style="padding:12px;">Name</th>
              <th style="padding:12px;">Email</th>
              <th style="padding:12px;">Phone</th>
              <th style="padding:12px;">Role</th>
              <th style="padding:12px;">Joined</th>
              <th style="padding:12px;text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr style="border-bottom:1px solid var(--border-light);font-size:0.9rem;">
                <td style="padding:12px;font-weight:600;">${escapeHtml(u.name)}</td>
                <td style="padding:12px;">${escapeHtml(u.email)}</td>
                <td style="padding:12px;">${escapeHtml(u.phone || '-')}</td>
                <td style="padding:12px;">
                  <span style="background:${u.role === 'admin' ? 'rgba(212,175,106,0.1)' : 'rgba(63,167,108,0.1)'};color:${u.role === 'admin' ? 'var(--champagne)' : 'var(--success-green)'};padding:4px 10px;border-radius:var(--radius-full);font-size:0.75rem;font-weight:600;">${u.role}</span>
                </td>
                <td style="padding:12px;color:var(--text-muted);">${u.createdAt ? formatDate(u.createdAt) : '-'}</td>
                <td style="padding:12px;text-align:right;">
                  <button class="btn btn-sm btn-danger" onclick="deleteUser('${u._id}','${escapeHtml(u.name)}')">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state card"><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function deleteUser(id, name) {
  if (!confirm(`Delete user "${name}" and all their data? This cannot be undone.`)) return;
  try {
    await api.delete(`/admin/users/${id}`);
    showToast('User deleted', 'success');
    loadAdminOverview();
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}
