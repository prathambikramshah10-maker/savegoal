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
    document.getElementById('statDeposited').textContent = formatNPR(data.totalDeposited);
    document.getElementById('statWithdrawn').textContent = formatNPR(data.totalWithdrawn);
    document.getElementById('statSavings').textContent = formatNPR(data.totalSavings);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadAdminUsers() {
  const container = document.getElementById('adminUsersContainer');
  try {
    const data = await api.get('/admin/users/summary');
    const users = data.users || [];

    if (users.length === 0) {
      container.innerHTML = `<div class="empty-state card"><h3>No users found</h3></div>`;
      return;
    }

    container.innerHTML = `
      <div class="card" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:860px;">
          <thead>
            <tr style="text-align:left;border-bottom:1px solid var(--border);font-size:0.78rem;color:var(--muted-text);text-transform:uppercase;letter-spacing:0.05em;">
              <th style="padding:12px;">Client</th>
              <th style="padding:12px;text-align:right;">Deposited</th>
              <th style="padding:12px;text-align:right;">Withdrawn</th>
              <th style="padding:12px;text-align:right;">Current Savings</th>
              <th style="padding:12px;text-align:center;">Goals</th>
              <th style="padding:12px;text-align:center;">Role</th>
              <th style="padding:12px;text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr style="border-bottom:1px solid var(--border-light);font-size:0.9rem;">
                <td style="padding:12px;">
                  <div style="font-weight:600;">${escapeHtml(u.name)}</div>
                  <div style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(u.email)}</div>
                </td>
                <td style="padding:12px;text-align:right;color:#4CAF50;font-weight:600;">${formatNPR(u.totalDeposited)}</td>
                <td style="padding:12px;text-align:right;color:var(--danger);font-weight:600;">${formatNPR(u.totalWithdrawn)}</td>
                <td style="padding:12px;text-align:right;color:var(--champagne);font-weight:700;">${formatNPR(u.currentSavings)}</td>
                <td style="padding:12px;text-align:center;">
                  <span style="color:var(--text-secondary);">${u.activeGoals} active</span>
                  ${u.completedGoals > 0 ? `<span style="color:#4CAF50;"> · ${u.completedGoals} done</span>` : ''}
                </td>
                <td style="padding:12px;text-align:center;">
                  <span style="background:${u.role === 'admin' ? 'rgba(91,131,184,0.1)' : 'rgba(62,166,124,0.1)'};color:${u.role === 'admin' ? 'var(--champagne)' : '#3EA67C'};padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;">${u.role}</span>
                </td>
                <td style="padding:12px;text-align:right;white-space:nowrap;">
                  <button class="btn btn-sm btn-primary" style="padding:6px 12px;font-size:0.78rem;" onclick="viewUser('${u.id}','${escapeHtml(u.name)}')">View</button>
                  ${u.role !== 'admin' ? `<button class="btn btn-sm btn-danger" style="padding:6px 10px;font-size:0.78rem;" onclick="deleteUser('${u.id}','${escapeHtml(u.name)}')">Delete</button>` : ''}
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

async function viewUser(id, name) {
  document.getElementById('userModalTitle').textContent = name;
  document.getElementById('userModalOverlay').style.display = 'flex';
  document.getElementById('userModalBody').innerHTML =
    `<div class="loading-overlay"><div class="spinner"></div></div>`;

  try {
    const data = await api.get(`/admin/users/${id}`);
    const { user, goals, transactions, summary } = data;

    let html = `
      <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:20px;">
        <div class="stat-card primary" style="flex:1;min-width:120px;padding:16px;">
          <div class="stat-value" style="font-size:1.2rem;color:var(--champagne);">${formatNPR(summary.currentSavings)}</div>
          <div class="stat-label">Current Savings</div>
        </div>
        <div class="stat-card" style="flex:1;min-width:120px;padding:16px;">
          <div class="stat-value" style="font-size:1.2rem;color:#4CAF50;">${formatNPR(summary.totalDeposited)}</div>
          <div class="stat-label">Total Deposited</div>
        </div>
        <div class="stat-card" style="flex:1;min-width:120px;padding:16px;">
          <div class="stat-value" style="font-size:1.2rem;color:var(--danger);">${formatNPR(summary.totalWithdrawn)}</div>
          <div class="stat-label">Total Withdrawn</div>
        </div>
        <div class="stat-card" style="flex:1;min-width:120px;padding:16px;">
          <div class="stat-value" style="font-size:1.2rem;">${summary.activeGoals}</div>
          <div class="stat-label">Active Goals</div>
        </div>
      </div>

      <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:6px;">
        ${escapeHtml(user.email)} · Joined ${formatDate(user.createdAt)}
      </div>
      <div style="height:1px;background:var(--border);margin:12px 0;"></div>

      <div style="font-weight:700;margin-bottom:8px;">Goals (${goals.length})</div>
      ${goals.length === 0 ? '<div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px;">No goals yet.</div>' : ''}
    `;

    html += goals.map(g => {
      const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
      return `
        <div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-light);">
          <div>
            <div style="font-weight:600;">${escapeHtml(g.name)}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);">${g.category || 'General'} · Target ${formatDate(g.targetDate)}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-weight:700;color:var(--champagne);">${formatNPR(g.currentAmount)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">of ${formatNPR(g.targetAmount)} (${pct}%)</div>
          </div>
        </div>
      `;
    }).join('');

    html += `
      <div style="height:1px;background:var(--border);margin:16px 0;"></div>
      <div style="font-weight:700;margin-bottom:8px;">Transactions (${transactions.length})</div>
    `;

    if (transactions.length === 0) {
      html += '<div style="color:var(--text-muted);font-size:0.85rem;">No transactions yet.</div>';
    } else {
      html += transactions.map(t => {
        const isDeposit = t.type === 'deposit';
        const color = t.status === 'cancelled' ? 'var(--text-muted)' : (isDeposit ? '#4CAF50' : 'var(--danger)');
        const sign = (!isDeposit && t.status !== 'cancelled') ? '-' : '';
        return `
          <div style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--border-light);">
            <div>
              <div style="font-weight:600;">${isDeposit ? 'Deposit' : 'Withdrawal'}${t.goalId && t.goalId.name ? ` → ${escapeHtml(t.goalId.name)}` : ''}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">${formatDate(t.date)}${t.note ? ' · ' + escapeHtml(t.note) : ''}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-weight:700;color:${color};">${sign}${formatNPR(t.amount)}</div>
              <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">${t.status}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    document.getElementById('userModalBody').innerHTML = html;
  } catch (err) {
    document.getElementById('userModalBody').innerHTML =
      `<div class="empty-state"><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function closeUserModal() {
  document.getElementById('userModalOverlay').style.display = 'none';
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

function exportClientCSV() {
  const url = API_BASE + '/admin/export';
  fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } })
    .then(res => {
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    })
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'savegoal_all_clients.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('All client data exported to CSV', 'success');
    })
    .catch(err => showToast(err.message, 'error'));
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}