const express = require('express');
const SavingsGoal = require('../models/SavingsGoal');
const SavingsTransaction = require('../models/SavingsTransaction');
const auth = require('../middleware/auth');
const { goalSchema } = require('../middleware/validation');
const { updateGoalFromTransactions } = require('../utils/goalHelper');
const { sendMail } = require('../utils/mailer');

async function sendMilestoneEmail(userEmail, userName, goalName, percentage) {
  try {
    const subject = percentage === 100
      ? `🎉 Congratulations! You completed "${goalName}"!`
      : `🎯 "${goalName}" reached ${percentage}%!`;
    const body = percentage === 100
      ? `<h2>Congratulations, ${userName}! 🎉</h2><p>You've reached <strong>100%</strong> of your savings goal <strong>"${goalName}"</strong>!</p><p>This is a huge achievement. Keep up the great work!</p><p style="margin-top:24px;"><a href="https://savegoal-br74.onrender.com/dashboard.html" style="background:#D4AF6A;color:#0B0D0F;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">View Dashboard</a></p>`
      : `<h2>Great progress, ${userName}! 🎯</h2><p>Your savings goal <strong>"${goalName}"</strong> has reached <strong>${percentage}%</strong>!</p><p>Keep saving — you're getting closer to your target!</p><p style="margin-top:24px;"><a href="https://savegoal-br74.onrender.com/dashboard.html" style="background:#D4AF6A;color:#0B0D0F;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">View Goal</a></p>`;
    await sendMail({
      to: userEmail,
      subject,
      html: body,
      text: `Savings update: "${goalName}" has reached ${percentage}%. Open your dashboard to see the progress.`
    });
  } catch (e) {
    console.log('Milestone email failed:', e.message);
  }
}

async function checkAndNotifyMilestones(goalId, userId) {
  try {
    const User = require('../models/User');
    const user = await User.findById(userId);
    if (!user || !user.email) return;

    const goal = await SavingsGoal.findById(goalId).lean();
    if (!goal || goal.targetAmount <= 0) return;

    const pct = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));

    const MILESTONE_KEY = `milestone_${userId}_${goalId}`;
    const Goal = SavingsGoal;
    if (!Goal[MILESTONE_KEY]) Goal[MILESTONE_KEY] = {};
    const seen = Goal[MILESTONE_KEY];

    [50, 75, 100].forEach(m => {
      if (pct >= m && !seen[m]) {
        seen[m] = true;
        sendMilestoneEmail(user.email, user.name, goal.name, m);
      }
    });
  } catch (e) { /* ignore */ }
}

const router = express.Router();

router.use(auth);

const appendView = (g) => ({
  ...g,
  percentage: g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0,
  remaining: Math.max(0, g.targetAmount - g.currentAmount)
});

async function attachConfirmedAmounts(goals, userId) {
  const aggregates = await SavingsTransaction.aggregate([
    { $match: { userId, status: 'confirmed' } },
    {
      $group: {
        _id: '$goalId',
        deposits: { $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0] } },
        withdrawals: { $sum: { $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0] } }
      }
    }
  ]);
  const map = {};
  aggregates.forEach((a) => { map[String(a._id)] = Math.max(0, a.deposits - a.withdrawals); });

  return goals.map((g) => {
    const confirmed = map[String(g._id)] !== undefined ? map[String(g._id)] : 0;
    const amount = Math.min(confirmed, g.targetAmount);
    return appendView({ ...g, currentAmount: amount });
  });
}

router.get('/', async (req, res) => {
  try {
    const goals = await SavingsGoal.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .lean();
    const enriched = await attachConfirmedAmounts(goals, req.userId);
    res.json({ goals: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching goals' });
  }
});

router.get('/streak', async (req, res) => {
  try {
    const transactions = await SavingsTransaction.find({
      userId: req.userId,
      status: 'confirmed',
      type: 'deposit'
    }).sort({ date: -1 }).lean();

    if (transactions.length === 0) {
      return res.json({ streak: 0, longestStreak: 0, lastDepositDate: null });
    }

    const dateSet = new Set();
    transactions.forEach(t => {
      const d = new Date(t.date);
      dateSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    });

    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const key = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      if (dateSet.has(key)) {
        currentStreak++;
      } else if (i > 0) {
        break;
      } else {
        break;
      }
    }

    let longestStreak = 0;
    let tempStreak = 1;
    const allDates = Array.from(dateSet).sort();
    for (let i = 1; i < allDates.length; i++) {
      const prev = new Date(allDates[i - 1]);
      const curr = new Date(allDates[i]);
      const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    res.json({
      streak: currentStreak,
      longestStreak,
      lastDepositDate: transactions[0]?.date || null
    });
  } catch (err) {
    res.status(500).json({ error: 'Error calculating streak' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const goals = await SavingsGoal.find({ userId: req.userId }).lean();
    const enriched = await attachConfirmedAmounts(goals, req.userId);

    const totalSaved = enriched.reduce((sum, g) => sum + g.currentAmount, 0);
    const totalTarget = enriched.reduce((sum, g) => sum + g.targetAmount, 0);
    const activeGoals = enriched.filter((g) => g.status === 'active').length;
    const completedGoals = enriched.filter((g) => g.status === 'completed').length;

    const pendingCount = await SavingsTransaction.countDocuments({
      userId: req.userId, status: 'pending', type: 'deposit'
    });

    const recentTransactions = await SavingsTransaction.find({ userId: req.userId })
      .sort({ date: -1 })
      .limit(8)
      .populate('goalId', 'name')
      .lean();

    res.json({
      stats: {
        totalSaved,
        totalTarget,
        pendingCount,
        totalGoals: enriched.length,
        activeGoals,
        completedGoals,
        overallPercentage: totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0
      },
      recentTransactions
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching stats' });
  }
});

/* Monthly net savings for the last 6 months (confirmed deposits - withdrawals) */
router.get('/monthly', async (req, res) => {
  try {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        label: d.toLocaleString('en-US', { month: 'short' }),
        year: d.getFullYear(),
        shortLabel: d.toLocaleString('en-US', { month: 'short' })
      });
    }

    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const transactions = await SavingsTransaction.find({
      userId: req.userId,
      status: 'confirmed',
      date: { $gte: start }
    }).lean();

    const map = {};
    transactions.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const delta = t.type === 'deposit' ? t.amount : -t.amount;
      map[key] = (map[key] || 0) + delta;
    });

    res.json({
      months: months.map((m) => ({ ...m, total: Math.round(map[m.key] || 0) })),
      highest: months.reduce((max, m) => Math.max(max, Math.round(map[m.key] || 0)), 0)
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching monthly savings' });
  }
});

/* Export ALL of the user's transactions as CSV */
router.get('/export-all', async (req, res) => {
  try {
    const transactions = await SavingsTransaction.find({ userId: req.userId })
      .sort({ date: 1 })
      .populate('goalId', 'name')
      .lean();

    let csv = 'Date,Goal,Type,Amount (NPR),Status,Note\n';
    transactions.forEach((t) => {
      const date = new Date(t.date).toLocaleDateString('en-US');
      const note = (t.note || '').replace(/,/g, ';');
      const goal = t.goalId?.name ? `"${String(t.goalId.name).replace(/"/g, '""')}"` : '';
      csv += `${date},${goal},${t.type},${t.amount},${t.status},"${note}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="savegoal_all_transactions.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Error exporting data' });
  }
});

router.post('/', async (req, res) => {
  try {
    const errors = goalSchema(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const { name, targetAmount, currentAmount, targetDate, category, description } = req.body;
    const startingAmount = currentAmount || 0;

    const goal = await SavingsGoal.create({
      userId: req.userId,
      name: name.trim(),
      targetAmount,
      currentAmount: 0,
      targetDate,
      category,
      description: (description || '').trim(),
      status: 'active'
    });

    if (startingAmount > 0) {
      const tx = await SavingsTransaction.create({
        userId: req.userId,
        goalId: goal._id,
        amount: startingAmount,
        type: 'deposit',
        status: 'pending',
        note: 'Starting amount (awaiting confirmation)'
      });
      return res.status(201).json({
        message: 'Goal created. Your starting amount is pending confirmation.',
        goal: appendView(goal.toJSON()),
        pending: true,
        pendingTransaction: tx
      });
    }

    res.status(201).json({
      message: 'Goal created successfully',
      goal: appendView(goal.toJSON())
    });
  } catch (err) {
    res.status(500).json({ error: 'Error creating goal' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId }).lean();
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    const [enriched] = await attachConfirmedAmounts([goal], req.userId);
    res.json({ goal: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching goal' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const { name, targetAmount, targetDate, category, description, isLocked } = req.body;

    if (name !== undefined) goal.name = name.trim();
    if (targetAmount !== undefined && targetAmount > 0) goal.targetAmount = targetAmount;
    if (targetDate !== undefined) goal.targetDate = targetDate;
    if (category !== undefined) goal.category = category;
    if (description !== undefined) goal.description = description.trim();
    if (isLocked !== undefined) goal.isLocked = Boolean(isLocked);

    await goal.save();
    await updateGoalFromTransactions(goal._id, req.userId);
    const updated = await SavingsGoal.findById(goal._id).lean();
    const [enriched] = await attachConfirmedAmounts([updated], req.userId);

    res.json({ message: 'Goal updated successfully', goal: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Error updating goal' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const goal = await SavingsGoal.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    await SavingsTransaction.deleteMany({ goalId: req.params.id, userId: req.userId });
    res.json({ message: 'Goal deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting goal' });
  }
});

router.get('/:id/export', async (req, res) => {
  try {
    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId }).lean();
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const transactions = await SavingsTransaction.find({
      goalId: req.params.id,
      userId: req.userId
    }).sort({ date: 1 }).lean();

    let csv = 'Date,Type,Amount (NPR),Status,Note\n';
    transactions.forEach(t => {
      const date = new Date(t.date).toLocaleDateString('en-US');
      const note = (t.note || '').replace(/,/g, ';');
      csv += `${date},${t.type},${t.amount},${t.status},"${note}"\n`;
    });

    csv += `\nGoal: ${goal.name}\nTarget: NPR ${goal.targetAmount}\nSaved: NPR ${goal.currentAmount}\nStatus: ${goal.status}\n`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${goal.name.replace(/[^a-z0-9]/gi, '_')}_transactions.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Error exporting data' });
  }
});

module.exports = router;
module.exports.checkAndNotifyMilestones = checkAndNotifyMilestones;
