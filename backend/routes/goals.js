const express = require('express');
const SavingsGoal = require('../models/SavingsGoal');
const SavingsTransaction = require('../models/SavingsTransaction');
const auth = require('../middleware/auth');
const { goalSchema } = require('../middleware/validation');
const { updateGoalFromTransactions } = require('../utils/goalHelper');

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

module.exports = router;
