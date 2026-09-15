/* ============================================================
   SaveGoal - Dashboard Logic
   ============================================================ */

let currentGoals = [];

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const user = getUser();
  if (user) {
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 18) greeting = 'Good afternoon';
    document.getElementById('greeting').textContent = `${greeting}, ${user.name.split(' ')[0]}!`;
  }

  const todayLine = document.getElementById('todayLine');
  if (todayLine) {
    todayLine.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  renderTip();
  loadDashboard();
  initCreateGoalForm();
});

const SAVINGS_TIPS = [
  "Automate a small transfer to your goal right after payday, before you spend it.",
  "The most effective way to save is to pay yourself first — even 5% adds up fast.",
  "Break big goals into weekly micro-deposits to make them feel less overwhelming.",
  "Keep your savings out of reach: the harder it is to spend, the easier it is to save.",
  "Round up small purchases and move the spare change into your goal.",
  "Review your subscriptions monthly — unused ones are silent savings leaks.",
  "Reward yourself at milestones: small wins keep long-term goals motivating.",
  "Saving isn't about how much you earn, it's about how much you keep.",
  "Track a streak: saving every day makes it a habit, not a chore.",
  "Don't withdraw for impulse buys — give yourself a 48-hour cooling-off rule."
];

function renderTip() {
  const el = document.getElementById('savingsTip');
  if (!el) return;
  const tip = SAVINGS_TIPS[Math.floor(Math.random() * SAVINGS_TIPS.length)];
  el.textContent = tip;
}

async function loadDashboard() {
  try {
    const [statsRes, goalsRes, streakRes, monthlyRes] = await Promise.all([
      api.get('/goals/stats'),
      api.get('/goals'),
      api.get('/goals/streak'),
      api.get('/goals/monthly')
    ]);

    updateStats(statsRes.stats, statsRes.recentTransactions);
    currentGoals = goalsRes.goals;
    renderGoals(currentGoals);
    renderStreak(streakRes);
    renderMonthlyChart(monthlyRes.months);
    checkProgressMilestones(currentGoals);
    renderAtRiskAlerts(currentGoals);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderStreak(streak) {
  const container = document.getElementById('streakContainer');
  if (!container) return;
  if (streak.streak === 0) {
    container.innerHTML = `
      <div class="streak-display">
        <div class="streak-number">0</div>
        <div class="streak-label">
          <strong>Start your streak!</strong><br>
          Save at least once today to begin.
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="streak-display">
        <div class="streak-number">${streak.streak}</div>
        <div class="streak-label">
          <strong>${streak.streak === 1 ? 'day' : 'days'} streak</strong><br>
          Longest: ${streak.longestStreak} ${streak.longestStreak === 1 ? 'day' : 'days'}
        </div>
      </div>
    `;
  }
}

const MILESTONE_KEY = 'savegoal_milestones_seen';

function checkProgressMilestones(goals) {
  try {
    const seen = JSON.parse(localStorage.getItem(MILESTONE_KEY) || '{}');
    goals.forEach(g => {
      if (g.status !== 'active' || g.targetAmount <= 0) return;
      const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
      const key = `${g._id}`;
      const prev = seen[key] || 0;
      [50, 75, 100].forEach(milestone => {
        if (pct >= milestone && prev < milestone) {
          if (milestone === 100) {
            showToast(`"${g.name}" is 100% complete! Congratulations!`, 'success');
          } else {
            showToast(`"${g.name}" reached ${milestone}% of its goal!`, 'info');
          }
        }
      });
      seen[key] = pct;
    });
    localStorage.setItem(MILESTONE_KEY, JSON.stringify(seen));
  } catch (e) { /* ignore */ }
}

function updateStats(stats, recentTransactions) {
  document.getElementById('statTotalSaved').textContent = formatNPR(stats.totalSaved);
  document.getElementById('statActiveGoals').textContent = stats.activeGoals;
  document.getElementById('statCompletedGoals').textContent = stats.completedGoals;
  document.getElementById('statOverall').textContent = stats.overallPercentage + '%';

  document.getElementById('overallPercentage').textContent = stats.overallPercentage + '%';
  document.getElementById('overallBar').style.width = stats.overallPercentage + '%';
  document.getElementById('overallSavedLabel').textContent = formatNPR(stats.totalSaved) + ' saved';
  document.getElementById('overallTargetLabel').textContent = 'Target: ' + formatNPR(stats.totalTarget);

  if (stats.pendingCount > 0) {
    showToast(`You have ${stats.pendingCount} pending savings awaiting confirmation.`, 'info');
  }

  if (stats.totalGoals === 0) {
    const card = document.getElementById('overallProgressCard');
    const body = document.getElementById('overallProgressBody');
    const empty = document.getElementById('overallEmpty');
    if (card && body && empty) {
      body.style.display = 'none';
      empty.style.display = 'block';
      card.style.marginBottom = '32px';
    }
  }

  renderRecentActivity(recentTransactions || []);
}

/* --- Recent Activity Feed --- */
function renderRecentActivity(transactions) {
  const container = document.getElementById('recentActivityContainer');
  if (!container) return;

  if (!transactions.length) {
    container.innerHTML = `
      <div class="activity-item" style="justify-content:center;text-align:center;color:var(--text-muted);">
        No activity yet. Make your first deposit to see it here!
      </div>
    `;
    return;
  }

  container.innerHTML = transactions.map((t) => {
    const isDeposit = t.type === 'deposit';
    const isPending = t.status === 'pending';
    const icon = isDeposit ? '💰' : '🏧';
    const statusChip = isPending
      ? '<span class="activity-status pending">Pending</span>'
      : `<span class="activity-status ${t.status === 'confirmed' ? 'confirmed' : 'cancelled'}">${t.status}</span>`;
    const goalName = t.goalId && t.goalId.name ? `<div class="activity-goal">${escapeHtml(t.goalId.name)}</div>` : '';
    const amount = formatNPR(t.amount);

    return `
      <div class="activity-item">
        <div class="activity-icon">${icon}</div>
        <div class="activity-body">
          <div class="activity-title">${isDeposit ? 'Added savings' : 'Withdrawn'} <strong class="${isDeposit ? 'act-deposit' : 'act-withdraw'}">${isDeposit ? '' : '-'}${amount}</strong></div>
          ${goalName}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          ${statusChip}
          <span class="activity-date">${formatDateShort(t.date)}</span>
        </div>
      </div>
    `;
  }).join('');
}

/* --- Monthly Savings Chart --- */
function renderMonthlyChart(months) {
  const container = document.getElementById('monthlyChart');
  if (!container) return;

  const card = document.getElementById('monthlyChartCard');
  if (!months || months.length === 0 || months.every((m) => !m.total)) {
    container.innerHTML = `
      <div class="empty-state" style="padding:24px 16px;">
        <div class="empty-state-icon">📊</div>
        <h3>No savings recorded yet</h3>
        <p>Once you make deposits, your monthly savings will show up here.</p>
      </div>
    `;
    if (card) card.style.display = '';
    return;
  }

  const highest = Math.max(...months.map((m) => m.total), 1);

  container.innerHTML = `
    <div class="chart-bars">
      ${months.map((m) => {
        const h = Math.max(4, Math.round((m.total / highest) * 100));
        const isCurrent = m.year === new Date().getFullYear() && m.label === new Date().toLocaleString('en-US', { month: 'short' });
        return `
          <div class="chart-col">
            <div class="chart-value">${m.total > 0 ? formatNPR(m.total) : '—'}</div>
            <div class="chart-bar ${m.total > 0 ? '' : 'chart-bar-empty'} ${isCurrent ? 'chart-bar-current' : ''}" style="height:${h}%"></div>
            <div class="chart-label">${m.label}${isCurrent ? ' •' : ''}</div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="text-align:center;font-size:0.8rem;color:var(--text-muted);margin-top:8px;">Net amount saved each month (deposits − withdrawals)</div>
  `;
}

/* --- Export all transactions --- */
function exportAllCSV() {
  const url = API_BASE + '/goals/export-all';
  fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } })
    .then(res => {
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    })
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'savegoal_all_transactions.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('All transactions exported to CSV', 'success');
    })
    .catch(err => showToast(err.message, 'error'));
}

/* --- At-risk goal detection --- */
function computeAtRisk(goal) {
  if (goal.status !== 'active' || goal.isLocked) return null;
  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return null;

  const b = calculateBudget(goal.targetAmount, goal.currentAmount, goal.targetDate);
  const created = new Date(goal.createdAt || Date.now());
  const monthsActive = Math.max(1, (Date.now() - created) / (1000 * 60 * 60 * 24 * 30.44));
  const avgMonthly = Math.max(0, goal.currentAmount / monthsActive);

  if (b.monthsLeft <= 1) {
    const days = Math.max(1, Math.ceil((new Date(goal.targetDate) - new Date()) / (1000 * 60 * 60 * 24)));
    if (avgMonthly * days < remaining * 0.9) return { reason: 'deadline' };
    return null;
  }

  const required = remaining / b.monthsLeft;
  if (avgMonthly === 0) return null;
  if (required > avgMonthly * 2.5) return { reason: 'pace' };
  return null;
}

function renderAtRiskAlerts(goals) {
  const atRisk = goals.map(g => ({ goal: g, risk: computeAtRisk(g) })).filter(x => x.risk);
  const container = document.getElementById('atRiskBanner');
  if (!container) return;

  if (atRisk.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = atRisk.map(({ goal, risk }) => {
    const b = calculateBudget(goal.targetAmount, goal.currentAmount, goal.targetDate);
    const msg = risk.reason === 'deadline'
      ? `"${escapeHtml(goal.name)}" is due ${daysUntil(goal.targetDate)} and may fall short. You'd need ~${formatNPR(b.monthly)}/month.`
      : `"${escapeHtml(goal.name)}" is behind pace. You'd need ~${formatNPR(b.monthly)}/month to finish on time.`;
    return `
      <div class="at-risk-alert">
        <span class="at-risk-icon">⚠️</span>
        <div>${msg} <a href="goal.html?id=${goal._id}" style="font-weight:600;text-decoration:underline;">Go to goal</a></div>
      </div>
    `;
  }).join('');
}

function renderGoals(goals) {
  const container = document.getElementById('goalsContainer');

  if (!goals || goals.length === 0) {
    container.innerHTML = `
      <div class="empty-state card">
        <div class="empty-state-icon">🎯</div>
        <h3>No goals yet</h3>
        <p>Create your first savings goal and start tracking your progress!</p>
        <button class="btn btn-primary" onclick="openCreateGoalModal()">+ Create Your First Goal</button>
        <div style="margin-top:24px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="quickCreateGoal('Laptop')">💻 Laptop</button>
          <button class="btn btn-outline btn-sm" onclick="quickCreateGoal('Phone')">📱 Phone</button>
          <button class="btn btn-outline btn-sm" onclick="quickCreateGoal('Emergency Fund')">🛡️ Emergency Fund</button>
          <button class="btn btn-outline btn-sm" onclick="quickCreateGoal('Travel')">✈️ Travel</button>
        </div>
      </div>
    `;
    return;
  }

  const sortedGoals = [...goals].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  container.innerHTML = `
    <div class="goals-grid">
      ${sortedGoals.map(g => renderGoalCard(g)).join('')}
    </div>
  `;
}

function renderGoalCard(goal) {
  const isCompleted = goal.status === 'completed';
  const isLocked = goal.isLocked === true;
  const percentage = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
    : 0;

  const budget = !isCompleted ? calculateBudget(goal.targetAmount, goal.currentAmount, goal.targetDate) : null;

  return `
    <div class="goal-card" onclick="window.location.href='goal.html?id=${goal._id}'">
      <div class="goal-card-header">
        <div class="goal-card-icon ${getCategoryClass(goal.category)}">${getCategoryIcon(goal.category)}</div>
        <span class="goal-card-category ${isCompleted ? 'completed' : ''}">${isCompleted ? '✓ Completed' : goal.category}</span>
      </div>
      <h3>${escapeHtml(goal.name)}</h3>
      <div class="goal-card-amounts">
        <span class="goal-card-current">${formatNPR(goal.currentAmount)}</span>
        <span class="goal-card-target">of ${formatNPR(goal.targetAmount)}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${percentage}%"></div>
      </div>
      <div class="goal-card-footer">
        <span class="goal-card-date">${isCompleted ? 'Completed' : daysUntil(goal.targetDate)}</span>
        <span class="goal-card-percentage">${percentage}%</span>
      </div>
      ${!isCompleted && !isLocked && budget ? `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light);">
        <span style="font-size:0.75rem;color:var(--text-muted);">Save ~${formatNPR(budget.monthly)}/mo</span>
        <button class="goal-card-quick-deposit" onclick="event.stopPropagation();openQuickDeposit('${goal._id}','${escapeHtml(goal.name).replace(/'/g,"\\'")}',${goal.currentAmount},${goal.targetAmount})">+ Deposit</button>
      </div>
      ` : ''}
    </div>
  `;
}

let quickDepositGoalId = null;

function openQuickDeposit(goalId, goalName, currentAmount, targetAmount) {
  quickDepositGoalId = goalId;
  const remaining = targetAmount - currentAmount;
  document.getElementById('quickDepositGoalName').textContent = goalName;
  document.getElementById('quickDepositRemaining').textContent = `Remaining: ${formatNPR(remaining)}`;
  document.getElementById('quickDepositAmount').value = '';
  document.getElementById('quickDepositAmount').max = remaining;
  document.getElementById('quickDepositAmount').placeholder = `Max: ${formatNPR(remaining)}`;
  document.getElementById('quickDepositNote').value = '';
  openModal('quickDepositModal');
}

async function submitQuickDeposit() {
  const amount = parseFloat(document.getElementById('quickDepositAmount').value);
  const note = document.getElementById('quickDepositNote').value.trim();
  const btn = document.getElementById('quickDepositBtn');

  if (!amount || amount <= 0) {
    showToast('Please enter a valid amount', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Adding...';

  try {
    await api.post(`/goals/${quickDepositGoalId}/savings`, { amount, note: note || 'Quick deposit' });
    showToast('Deposit recorded. Confirm it on the goal page to update your balance.', 'info');
    closeModal('quickDepositModal');
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Deposit';
  }
}

function initCreateGoalForm() {
  const form = document.getElementById('createGoalForm');
  if (!form) return;

  const today = new Date();
  today.setFullYear(today.getFullYear() + 1);
  document.getElementById('goalDate').value = today.toISOString().split('T')[0];

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('createGoalBtn');
    const data = {
      name: document.getElementById('goalName').value.trim(),
      targetAmount: parseFloat(document.getElementById('goalTarget').value),
      currentAmount: parseFloat(document.getElementById('goalStarting').value) || 0,
      targetDate: document.getElementById('goalDate').value,
      category: document.getElementById('goalCategory').value,
      description: document.getElementById('goalDescription').value.trim()
    };

    if (!data.name || !data.targetAmount || !data.targetDate || !data.category) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    if (data.targetAmount <= 0) {
      showToast('Target amount must be greater than 0', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      await api.post('/goals', data);
      showToast('Goal created successfully!', 'success');
      closeModal('createGoalModal');
      form.reset();
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Goal';
    }
  });
}

function openCreateGoalModal() {
  openModal('createGoalModal');
}

function quickCreateGoal(category) {
  const defaults = {
    'Laptop': { name: 'New Laptop', target: 120000 },
    'Phone': { name: 'New Phone', target: 60000 },
    'Emergency Fund': { name: 'Emergency Fund', target: 100000 },
    'Travel': { name: 'Dream Vacation', target: 80000 }
  };
  const d = defaults[category] || { name: category, target: 50000 };
  document.getElementById('goalName').value = d.name;
  document.getElementById('goalTarget').value = d.target;
  const catSelect = document.getElementById('goalCategory');
  if (Array.from(catSelect.options).some((o) => o.value === category)) {
    catSelect.value = category;
  }
  document.getElementById('goalDescription').value = '';
  openCreateGoalModal();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
