const express = require('express');
const User = require('../models/User');
const SavingsGoal = require('../models/SavingsGoal');
const SavingsTransaction = require('../models/SavingsTransaction');
const admin = require('../middleware/admin');

const router = express.Router();

router.use(admin);

router.get('/overview', async (req, res) => {
  try {
    const [
      users,
      goals,
      transactions,
      completed,
      confirmedAgg,
      deposits,
      withdrawals
    ] = await Promise.all([
      User.countDocuments(),
      SavingsGoal.countDocuments(),
      SavingsTransaction.countDocuments(),
      SavingsGoal.countDocuments({ status: 'completed' }),
      SavingsTransaction.aggregate([
        { $match: { status: 'confirmed' } },
        { $group: { _id: null, total: { $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', { $multiply: [-1, '$amount'] }] } } } }
      ]),
      SavingsTransaction.aggregate([
        { $match: { status: 'confirmed', type: 'deposit' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      SavingsTransaction.aggregate([
        { $match: { status: 'confirmed', type: 'withdrawal' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);
    res.json({
      users,
      goals,
      transactions,
      completedGoals: completed,
      totalSavings: confirmedAgg[0]?.total || 0,
      totalDeposited: deposits[0]?.total || 0,
      totalWithdrawn: withdrawals[0]?.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching admin overview' });
  }
});

/* All users with per-user savings summary (aggregated) */
router.get('/users/summary', async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 }).lean();

    const txs = await SavingsTransaction.find({ status: 'confirmed' })
      .select('userId type amount')
      .lean();

    const goals = await SavingsGoal.find().select('userId currentAmount targetAmount status').lean();

    const sums = {};
    for (const t of txs) {
      const key = String(t.userId);
      sums[key] = sums[key] || { deposited: 0, withdrawn: 0 };
      if (t.type === 'deposit') sums[key].deposited += t.amount;
      else sums[key].withdrawn += t.amount;
    }

    const goalStats = {};
    for (const g of goals) {
      const key = String(g.userId);
      goalStats[key] = goalStats[key] || { active: 0, completed: 0, invested: 0, target: 0 };
      if (g.status === 'completed') goalStats[key].completed += 1;
      else if (g.status === 'active') {
        goalStats[key].active += 1;
        goalStats[key].invested += g.currentAmount;
        goalStats[key].target += g.targetAmount;
      }
    }

    const summary = users.map((u) => {
      const s = sums[String(u._id)] || { deposited: 0, withdrawn: 0 };
      const g = goalStats[String(u._id)] || { active: 0, completed: 0, invested: 0, target: 0 };
      return {
        id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        createdAt: u.createdAt,
        totalDeposited: Math.round(s.deposited),
        totalWithdrawn: Math.round(s.withdrawn),
        currentSavings: Math.round(s.deposited - s.withdrawn),
        activeGoals: g.active,
        completedGoals: g.completed,
        investedGoalTarget: g.target
      };
    });

    res.json({ users: summary });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching user summary' });
  }
});

/* Detailed view of one user: profile + goals + transactions */
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [goals, transactions] = await Promise.all([
      SavingsGoal.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
      SavingsTransaction.find({ userId: user._id })
        .sort({ date: -1, createdAt: -1 })
        .populate('goalId', 'name')
        .lean()
    ]);

    let deposited = 0;
    let withdrawn = 0;
    for (const t of transactions) {
      if (t.status !== 'confirmed') continue;
      if (t.type === 'deposit') deposited += t.amount;
      else withdrawn += t.amount;
    }

    res.json({
      user,
      goals,
      transactions,
      summary: {
        totalDeposited: Math.round(deposited),
        totalWithdrawn: Math.round(withdrawn),
        currentSavings: Math.round(deposited - withdrawn),
        activeGoals: goals.filter((g) => g.status === 'active').length,
        completedGoals: goals.filter((g) => g.status === 'completed').length
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching user' });
  }
});

/* Export all clients' full data as CSV (admin only) */
router.get('/export', async (req, res) => {
  try {
    const [users, goals, transactions] = await Promise.all([
      User.find().select('-passwordHash').lean(),
      SavingsGoal.find().lean(),
      SavingsTransaction.find().populate('goalId', 'name').lean()
    ]);

    const userMap = {};
    for (const u of users) userMap[String(u._id)] = u;

    let csv = 'Client Name,Client Email,Phone,Goal Name,Category,Type,Amount (NPR),Status,Date,Note\n';
    for (const t of transactions) {
      const u = userMap[String(t.userId)] || {};
      const goalName = t.goalId?.name ? `"${String(t.goalId.name).replace(/"/g, '""')}"` : '';
      const note = (t.note || '').replace(/,/g, ';');
      const date = new Date(t.date).toLocaleDateString('en-US');
      const category = (t.category || '').replace(/,/g, ';');
      const type = t.type || '';
      const status = t.status || '';
      csv += `"${(u.name || '').replace(/"/g, '""')}","${(u.email || '').replace(/"/g, '""')}","${(u.phone || '').replace(/"/g, '""')}",${goalName},${category},${type},${t.amount},${status},${date},"${note}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="savegoal_all_clients.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Error exporting client data' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.email === process.env.ADMIN_EMAIL) {
      return res.status(400).json({ error: 'Cannot delete the main admin account' });
    }
    await SavingsTransaction.deleteMany({ userId: user._id });
    await SavingsGoal.deleteMany({ userId: user._id });
    await User.findByIdAndDelete(user._id);
    res.json({ message: 'User and all their data deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting user' });
  }
});

/* Keep legacy route order safe: /users/summary and /users/export must come before /users/:id */
module.exports = router;