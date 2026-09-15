/* ============================================================
   SaveGoal - Goal Details Logic
   ============================================================ */

let currentGoal = null;
let pendingTransactionId = null;
let pendingSavingsTxId = null;
let pendingWithdrawAmount = null;
let otpCountdownTimer = null;

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
    allTransactions = transactionsRes.transactions;
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

    ${!isCompleted && !isLocked ? `
    <div class="budget-card">
      <h4>💡 Savings Budget</h4>
      ${(() => {
        const b = calculateBudget(goal.targetAmount, goal.currentAmount, goal.targetDate);
        return `
        <div class="budget-amount">${formatNPR(b.monthly)}<span style="font-size:0.9rem;font-weight:500;color:var(--text-muted);">/month</span></div>
        <div class="budget-detail">
          To reach your target, save approximately:<br>
          <strong>${formatNPR(b.daily)}</strong> daily · <strong>${formatNPR(b.weekly)}</strong> weekly · <strong>${formatNPR(b.monthly)}</strong> monthly<br>
          You have <strong>${b.monthsLeft}</strong> ${b.monthsLeft === 1 ? 'month' : 'months'} (${daysUntil(goal.targetDate)}) left.
        </div>
        `;
      })()}
    </div>
    ` : ''}

    <div class="section-header">
      <h2 class="section-title">Savings History</h2>
      <button class="btn-export" onclick="exportCSV('${goal._id}','${escapeHtml(goal.name).replace(/'/g,"\\'")}')">📥 Export CSV</button>
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
    <div class="filter-bar" id="transactionFilterBar">
      <select class="form-select" id="filterType" onchange="applyTransactionFilters()">
        <option value="">All Types</option>
        <option value="deposit">Deposits</option>
        <option value="withdrawal">Withdrawals</option>
      </select>
      <select class="form-select" id="filterStatus" onchange="applyTransactionFilters()">
        <option value="">All Status</option>
        <option value="confirmed">Confirmed</option>
        <option value="pending">Pending</option>
      </select>
      <input type="date" class="form-input" id="filterDateFrom" onchange="applyTransactionFilters()" title="From date">
      <input type="date" class="form-input" id="filterDateTo" onchange="applyTransactionFilters()" title="To date">
      <input type="text" class="form-input" id="filterSearch" placeholder="Search notes..." oninput="applyTransactionFilters()" style="max-width:160px;">
      <button class="btn btn-sm btn-secondary" onclick="clearTransactionFilters()">Clear</button>
    </div>
    <div class="transaction-list" id="transactionList">
      ${transactions.map(t => renderTransactionItem(t)).join('')}
    </div>
  `;
}

let allTransactions = [];

function setAllTransactions(transactions) {
  allTransactions = transactions;
}

function applyTransactionFilters() {
  const type = document.getElementById('filterType')?.value || '';
  const status = document.getElementById('filterStatus')?.value || '';
  const dateFrom = document.getElementById('filterDateFrom')?.value || '';
  const dateTo = document.getElementById('filterDateTo')?.value || '';
  const search = (document.getElementById('filterSearch')?.value || '').toLowerCase();

  let filtered = allTransactions.filter(t => {
    if (type && t.type !== type) return false;
    if (status && t.status !== status) return false;
    if (dateFrom && new Date(t.date) < new Date(dateFrom)) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (new Date(t.date) > end) return false;
    }
    if (search && !(t.note || '').toLowerCase().includes(search)) return false;
    return true;
  });

  const list = document.getElementById('transactionList');
  if (list) {
    list.innerHTML = filtered.map(t => renderTransactionItem(t)).join('');
  }
}

function clearTransactionFilters() {
  document.getElementById('filterType').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  document.getElementById('filterSearch').value = '';
  applyTransactionFilters();
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
        <div class="note">${escapeHtml(t.note || (isWithdrawal ? 'Withdrawal' : 'Savings'))}</div>
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
    if (!/^\d{6}$/.test(otp)) {
      showToast('Tap "Send Code", then enter the 6-digit code from your email', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Confirming...';

    try {
      let txId = pendingSavingsTxId;
      if (!txId) {
        const createData = await api.post(`/goals/${goalId}/savings`, { amount, note });
        txId = createData.transaction._id;
      }

      const confirmRes = await api.post(`/goals/${goalId}/savings/${txId}/confirm`, { code: otp });
      pendingSavingsTxId = null;
      stopOtpCountdown();
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

async function handleSendSavingsCode() {
  if (!currentGoal) return;

  const amount = parseFloat(document.getElementById('savingsAmount').value);
  const note = document.getElementById('savingsNote').value.trim();
  const goalId = new URLSearchParams(window.location.search).get('id');
  const btn = document.getElementById('sendSavingsCodeBtn');
  const statusEl = document.getElementById('savingsOtpStatus');
  const countdownEl = document.getElementById('savingsOtpCountdown');

  if (!amount || amount <= 0) {
    showToast('Enter the amount first', 'error');
    return;
  }
  const remaining = currentGoal.targetAmount - currentGoal.currentAmount;
  if (amount > remaining) {
    showToast(`Amount cannot exceed remaining ${formatNPR(remaining)}`, 'error');
    return;
  }

  setLoading(btn, true);
  try {
    if (!pendingSavingsTxId) {
      const createData = await api.post(`/goals/${goalId}/savings`, { amount, note });
      pendingSavingsTxId = createData.transaction._id;
    }

    const data = await api.post(`/goals/${goalId}/savings/${pendingSavingsTxId}/confirm`, {});
    statusEl.style.color = 'var(--text-secondary)';
    statusEl.textContent = data.devCode
      ? `Dev mode (email not configured): your code is ${data.devCode}`
      : 'Verification code sent! Check your email for the 6-digit code.';
    startOtpCountdown(data.cooldownMs ? Math.ceil(data.cooldownMs / 1000) : 60, countdownEl);
  } catch (err) {
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = err.message;
    if (err.cooldownMs) startOtpCountdown(Math.ceil(err.cooldownMs / 1000), countdownEl);
  } finally {
    setLoading(btn, false);
  }
}

function openConfirmSavingsModal(transactionId) {
  pendingTransactionId = transactionId;
  document.getElementById('pendingSavingsInfo').innerHTML = `<p style="margin-bottom:0;">Sending a verification code to your email...</p>`;
  document.getElementById('pendingConfirmCode').value = '';
  openModal('confirmSavingsModal');

  const goalId = new URLSearchParams(window.location.search).get('id');
  api.post(`/goals/${goalId}/savings/${transactionId}/confirm`, {})
    .then((data) => {
      const info = document.getElementById('pendingSavingsInfo');
      info.innerHTML = data.devCode
        ? `<p style="margin-bottom:0;">Dev mode (email not configured): your code is <strong>${data.devCode}</strong></p>`
        : `<p style="margin-bottom:0;">A 6-digit confirmation code was sent to your email. Enter it below to finalize this deposit.</p>`;
      startOtpCountdown(data.cooldownMs ? Math.ceil(data.cooldownMs / 1000) : 60, document.getElementById('savingsOtpCountdown'));
    })
    .catch((err) => {
      const info = document.getElementById('pendingSavingsInfo');
      info.innerHTML = `<p style="margin-bottom:0;color:var(--danger);">${err.message}</p>`;
    });
}

function initConfirmSavings() {
  const btn = document.getElementById('confirmSavingsBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const goalId = new URLSearchParams(window.location.search).get('id');
    const code = document.getElementById('pendingConfirmCode').value.trim();
    if (!/^\d{6}$/.test(code)) {
      showToast('Enter the 6-digit code from your email', 'error');
      return;
    }
    try {
      const data = await api.post(`/goals/${goalId}/savings/${pendingTransactionId}/confirm`, { code });
      pendingTransactionId = null;
      stopOtpCountdown();
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
    const amount = pendingWithdrawAmount !== null
      ? pendingWithdrawAmount
      : parseFloat(document.getElementById('withdrawAmount').value);
    const code = document.getElementById('withdrawCode').value.trim();

    if (!amount || amount <= 0) {
      showToast('Enter a valid withdrawal amount', 'error');
      return;
    }
    if (amount > currentGoal.currentAmount) {
      showToast('Withdrawal amount exceeds available balance', 'error');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      showToast('Tap "Send Code", then enter the 6-digit code from your email', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Processing...';
    try {
      const data = await api.post(`/goals/${goalId}/withdraw`, { amount, code });
      pendingWithdrawAmount = null;
      stopOtpCountdown();
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

async function handleSendWithdrawCode() {
  if (!currentGoal) return;

  const amount = parseFloat(document.getElementById('withdrawAmount').value);
  const goalId = new URLSearchParams(window.location.search).get('id');
  const btn = document.getElementById('sendWithdrawCodeBtn');
  const statusEl = document.getElementById('withdrawOtpStatus');
  const countdownEl = document.getElementById('withdrawOtpCountdown');

  if (!amount || amount <= 0) {
    showToast('Enter a valid withdrawal amount', 'error');
    return;
  }
  if (amount > currentGoal.currentAmount) {
    showToast('Withdrawal amount exceeds available balance', 'error');
    return;
  }

  setLoading(btn, true);
  try {
    const data = await api.post(`/goals/${goalId}/withdraw`, { amount });

    if (data.confirmRequired) {
      pendingWithdrawAmount = amount;
      statusEl.style.color = 'var(--text-secondary)';
      statusEl.textContent = data.devCode
        ? `Dev mode (email not configured): your code is ${data.devCode}`
        : 'Verification code sent! Check your email for the 6-digit code.';
      startOtpCountdown(data.cooldownMs ? Math.ceil(data.cooldownMs / 1000) : 60, countdownEl);
    } else {
      pendingWithdrawAmount = null;
      showToast('Withdrawal completed', 'success');
      closeModal('withdrawModal');
      currentGoal = data.goal;
      renderGoalDetail(data.goal);
      const transRes = await api.get(`/goals/${goalId}/transactions`);
      renderTransactions(transRes.transactions);
    }
  } catch (err) {
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = err.message;
    if (err.cooldownMs) startOtpCountdown(Math.ceil(err.cooldownMs / 1000), countdownEl);
  } finally {
    setLoading(btn, false);
  }
}

function startOtpCountdown(seconds, countdownEl) {
  stopOtpCountdown();
  if (!countdownEl) return;
  countdownEl.style.display = 'block';
  countdownEl.textContent = `Resend code in ${seconds}s`;

  otpCountdownTimer = setInterval(() => {
    seconds -= 1;
    if (seconds <= 0) {
      stopOtpCountdown();
      countdownEl.style.display = 'none';
      countdownEl.textContent = '';
      return;
    }
    countdownEl.textContent = `Resend code in ${seconds}s`;
  }, 1000);
}

function stopOtpCountdown() {
  if (otpCountdownTimer) {
    clearInterval(otpCountdownTimer);
    otpCountdownTimer = null;
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
