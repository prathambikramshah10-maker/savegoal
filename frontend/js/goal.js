/* ============================================================
   SaveGoal - Goal Details Logic
   ============================================================ */

let currentGoal = null;
let pendingTransactionId = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const params = new URLSearchParams(window.location.search);
  const goalId = params.get('id');

  if (!goalId) {
    window.location.href = 'dashboard.html';
    return;
  }

  loadGoal(goalId);
  initAddSavingsForm(goalId);
  initEditGoalForm(goalId);
  initWithdrawForm(goalId);
  initConfirmSavings();
});

async function loadGoal(goalId) {
  try {
    const [goalRes, transactionsRes] = await Promise.all([
      api.get(`/goals/${goalId}`),
      api.get(`/goals/${goalId}/transactions`)
    ]);

    currentGoal = goalRes.goal;
    renderGoalDetail(currentGoal);
    renderTransactions(transactionsRes.transactions);
  } catch (err) {
    showToast(err.message, 'error');
    document.getElementById('goalContent').innerHTML = `
      <div class="empty-state card">
        <div class="empty-state-icon">😔</div>
        <h3>Goal not found</h3>
        <p>This goal may have been deleted or you don't have access to it.</p>
        <a href="dashboard.html" class="btn btn-primary">Back to Dashboard</a>
      </div>
    `;
  }
}

function renderGoalDetail(goal) {
  const container = document.getElementById('goalContent');
  const isCompleted = goal.status === 'completed';
  const isLocked = goal.isLocked === true;
  const percentage = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
    : 0;
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

  container.innerHTML = `
    <div class="goal-detail-header">
      <div class="goal-detail-info">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div class="goal-card-icon ${getCategoryClass(goal.category)}" style="width:52px;height:52px;font-size:1.6rem;">
            ${getCategoryIcon(goal.category)}
          </div>
          <div>
            <h1>${escapeHtml(goal.name)} ${isLocked ? '<span title="This goal is locked" style="font-size:1rem;">🔒</span>' : ''}</h1>
            <span class="goal-card-category ${isCompleted ? 'completed' : ''}" style="font-size:0.85rem;">
              ${isCompleted ? '✓ Completed' : goal.category}
            </span>
            ${isLocked ? '<span class="goal-card-category" style="margin-left:6px;background:rgba(196,77,77,0.1);color:var(--danger);">Locked</span>' : ''}
          </div>
        </div>
      </div>
      <div class="goal-detail-actions">
        ${!isCompleted && !isLocked ? `<button class="btn btn-primary" onclick="openAddSavingsModal()">+ Add Savings</button>` : ''}
        ${!isCompleted && !isLocked && goal.currentAmount > 0 ? `<button class="btn btn-secondary" onclick="openWithdrawModal()">Withdraw</button>` : ''}
        <button class="btn btn-secondary" onclick="openEditGoalModal()">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="openModal('deleteConfirmModal')">Delete</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <div class="goal-detail-amounts">
        <div class="goal-detail-amount">
          <span class="label">Saved</span>
          <span class="value primary">${formatNPR(goal.currentAmount)}</span>
        </div>
        <div class="goal-detail-amount">
          <span class="label">Target</span>
          <span class="value">${formatNPR(goal.targetAmount)}</span>
        </div>
        <div class="goal-detail-amount">
          <span class="label">${isCompleted ? 'Completed' : 'Remaining'}</span>
          <span class="value ${isCompleted ? 'primary' : 'danger'}">${isCompleted ? '100%' : formatNPR(remaining)}</span>
        </div>
        <div class="goal-detail-amount">
          <span class="label">${isCompleted ? 'Status' : 'Days Left'}</span>
          <span class="value">${isCompleted ? '🎉 Done' : daysUntil(goal.targetDate)}</span>
        </div>
      </div>

      <div class="progress-bar progress-bar-lg" style="margin-top:20px;">
        <div class="progress-fill" style="width:${percentage}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:0.85rem;color:var(--text-muted);">
        <span>${percentage}% complete</span>
        <span>Target: ${formatDate(goal.targetDate)}</span>
      </div>

      ${goal.description ? `<p style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-light);font-size:0.95rem;">${escapeHtml(goal.description)}</p>` : ''}
    </div>

    <div class="section-header">
      <h2 class="section-title">Savings History</h2>
    </div>

    <div id="transactionsContainer"></div>
  `;

  if (isCompleted) {
    setTimeout(() => celebrate(), 500);
  }
}

function renderTransactions(transactions) {
  const container = document.getElementById('transactionsContainer');

  if (!transactions || transactions.length === 0) {
    container.innerHTML = `
      <div class="card empty-state" style="padding:40px;">
        <div class="empty-state-icon">📝</div>
        <h3>No transactions yet</h3>
        <p>Start adding savings to see your transaction history here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="transaction-list">
      ${transactions.map(t => renderTransactionItem(t)).join('')}
    </div>
  `;
}

function renderTransactionItem(t) {
  const isWithdrawal = t.type === 'withdrawal';
  const isPending = t.status === 'pending';
  const isCancelled = t.status === 'cancelled';

  let actionHtml = '';
  if (isPending && !isWithdrawal) {
    actionHtml = `<button class="btn btn-sm btn-primary" onclick="openConfirmSavingsModal('${t._id}')">Confirm</button>`;
  }
  if (isWithdrawal) {
    actionHtml = `<span style="font-size:0.8rem;color:var(--danger);font-weight:600;">Withdrawal</span>`;
  }

  const amountClass = isWithdrawal ? 'amount-withdrawal' : 'transaction-amount';
  const amountSign = isWithdrawal ? '-' : '+';

  return `
    <div class="transaction-item ${isPending ? 'tx-pending' : ''} ${isCancelled ? 'tx-cancelled' : ''}">
      <div class="transaction-icon">${isWithdrawal ? '🏦' : '💰'}</div>
      <div class="transaction-info">
        <div class="note">${t.note || (isWithdrawal ? 'Withdrawal' : 'Savings')}</div>
        <div class="date">${formatDate(t.date)} ${isCancelled ? '· Cancelled' : ''} ${isPending ? '· ⏳ Pending' : ''}</div>
      </div>
      <div class="${amountClass}">${amountSign}${formatNPR(t.amount)}</div>
      ${actionHtml}
    </div>
  `;
}

function openAddSavingsModal() {
  if (!currentGoal) return;
  const remaining = currentGoal.targetAmount - currentGoal.currentAmount;

  document.getElementById('modalCurrentAmount').textContent = formatNPR(currentGoal.currentAmount);
  document.getElementById('modalRemaining').textContent = 'Remaining: ' + formatNPR(remaining);

  const amountInput = document.getElementById('savingsAmount');
  amountInput.max = remaining;
  amountInput.placeholder = `Max: ${formatNPR(remaining)}`;

  document.getElementById('savingsAmount').value = '';
  document.getElementById('savingsNote').value = '';
  document.getElementById('savingsConfirmCode').value = '';

  openModal('addSavingsModal');
}

function initAddSavingsForm(goalId) {
  const form = document.getElementById('addSavingsForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const amount = parseFloat(document.getElementById('savingsAmount').value);
    const note = document.getElementById('savingsNote').value.trim();
    const otp = document.getElementById('savingsConfirmCode').value.trim();
    const btn = document.getElementById('addSavingsBtn');

    if (!amount || amount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    const remaining = currentGoal.targetAmount - currentGoal.currentAmount;
    if (amount > remaining) {
      showToast(`Amount cannot exceed remaining ${formatNPR(remaining)}`, 'error');
      return;
    }
    if (!otp) {
      showToast('A confirmation code is required to confirm your deposit', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
      const data = await api.post(`/goals/${goalId}/savings`, { amount, note });
      const txId = data.transaction._id;
      const confirmRes = await api.post(`/goals/${goalId}/savings/${txId}/confirm`, { code: otp });
      showToast('Savings added and confirmed!', 'success');
      closeModal('addSavingsModal');
      currentGoal = confirmRes.goal;
      renderGoalDetail(confirmRes.goal);
      const transRes = await api.get(`/goals/${goalId}/transactions`);
      renderTransactions(transRes.transactions);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add & Confirm Savings';
    }
  });
}

function openConfirmSavingsModal(transactionId) {
  pendingTransactionId = transactionId;
  document.getElementById('pendingSavingsInfo').innerHTML = `<p>Enter the confirmation code we sent to your email to finalize this deposit.</p>`;
  document.getElementById('pendingConfirmCode').value = '';
  openModal('confirmSavingsModal');
}

function initConfirmSavings() {
  const btn = document.getElementById('confirmSavingsBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const goalId = new URLSearchParams(window.location.search).get('id');
    const code = document.getElementById('pendingConfirmCode').value.trim();
    if (!code) {
      showToast('Please enter the confirmation code', 'error');
      return;
    }
    try {
      const data = await api.post(`/goals/${goalId}/savings/${pendingTransactionId}/confirm`, { code });
      pendingTransactionId = null;
      showToast('Savings confirmed!', 'success');
      closeModal('confirmSavingsModal');
      currentGoal = data.goal;
      renderGoalDetail(data.goal);
      const transRes = await api.get(`/goals/${goalId}/transactions`);
      renderTransactions(transRes.transactions);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function openWithdrawModal() {
  if (!currentGoal) return;
  document.getElementById('withdrawAvailable').textContent = `Available to withdraw: ${formatNPR(currentGoal.currentAmount)}`;
  document.getElementById('withdrawAmount').value = '';
  document.getElementById('withdrawCode').value = '';
  openModal('withdrawModal');
}

function initWithdrawForm(goalId) {
  const btn = document.getElementById('withdrawBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const code = document.getElementById('withdrawCode').value.trim();

    if (!amount || amount <= 0) {
      showToast('Enter a valid withdrawal amount', 'error');
      return;
    }
    if (amount > currentGoal.currentAmount) {
      showToast('Withdrawal amount exceeds available balance', 'error');
      return;
    }
    if (!code) {
      showToast('A confirmation code is required to approve the withdrawal', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Processing...';
    try {
      const data = await api.post(`/goals/${goalId}/withdraw`, { amount, code });
      showToast('Withdrawal completed', 'success');
      closeModal('withdrawModal');
      currentGoal = data.goal;
      renderGoalDetail(data.goal);
      const transRes = await api.get(`/goals/${goalId}/transactions`);
      renderTransactions(transRes.transactions);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Withdraw Funds';
    }
  });
}

function openEditGoalModal() {
  if (!currentGoal) return;

  document.getElementById('editGoalName').value = currentGoal.name;
  document.getElementById('editGoalTarget').value = currentGoal.targetAmount;
  document.getElementById('editGoalDate').value = new Date(currentGoal.targetDate).toISOString().split('T')[0];
  document.getElementById('editGoalCategory').value = currentGoal.category;
  document.getElementById('editGoalDesc').value = currentGoal.description || '';
  document.getElementById('editGoalLock').checked = currentGoal.isLocked === true;

  openModal('editGoalModal');
}

function initEditGoalForm(goalId) {
  const form = document.getElementById('editGoalForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('editGoalBtn');
    const data = {
      name: document.getElementById('editGoalName').value.trim(),
      targetAmount: parseFloat(document.getElementById('editGoalTarget').value),
      targetDate: document.getElementById('editGoalDate').value,
      category: document.getElementById('editGoalCategory').value,
      description: document.getElementById('editGoalDesc').value.trim(),
      isLocked: document.getElementById('editGoalLock').checked
    };

    if (!data.name || !data.targetAmount || !data.targetDate || !data.category) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const res = await api.put(`/goals/${goalId}`, data);
      showToast('Goal updated successfully', 'success');
      closeModal('editGoalModal');
      currentGoal = res.goal;
      renderGoalDetail(res.goal);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });
}

async function confirmDeleteGoal() {
  const goalId = new URLSearchParams(window.location.search).get('id');
  const btn = document.getElementById('confirmDeleteBtn');

  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    await api.delete(`/goals/${goalId}`);
    showToast('Goal deleted', 'success');
    window.location.href = 'dashboard.html';
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Delete Goal';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
