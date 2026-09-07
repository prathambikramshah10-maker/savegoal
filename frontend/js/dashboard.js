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

  loadDashboard();
  initCreateGoalForm();
});

async function loadDashboard() {
  try {
    const [statsRes, goalsRes] = await Promise.all([
      api.get('/goals/stats'),
      api.get('/goals')
    ]);

    updateStats(statsRes.stats, statsRes.recentTransactions);
    currentGoals = goalsRes.goals;
    renderGoals(currentGoals);
  } catch (err) {
    showToast(err.message, 'error');
  }
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
    document.getElementById('overallProgressCard').style.display = 'none';
  }
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
  const percentage = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
    : 0;

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
    </div>
  `;
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
