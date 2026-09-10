const express = require('express');
const SavingsGoal = require('../models/SavingsGoal');
const SavingsTransaction = require('../models/SavingsTransaction');
const auth = require('../middleware/auth');
const { savingsSchema } = require('../middleware/validation');
const { createAndSendOtp, verifyOtp } = require('../utils/otp');
const { updateGoalFromTransactions } = require('../utils/goalHelper');
const { checkAndNotifyMilestones } = require('./goals');

const router = express.Router();

router.use(auth);

const appendGoalView = (goal) => ({
  ...goal.toJSON(),
  percentage: goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0,
  remaining: Math.max(0, goal.targetAmount - goal.currentAmount)
});

router.post('/:id/savings', async (req, res) => {
  try {
    const errors = savingsSchema(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    if (goal.isLocked) {
      return res.status(403).json({ error: 'This goal is locked and cannot accept new savings. Unlock it in Edit.' });
    }
    if (goal.status === 'completed') {
      return res.status(400).json({ error: 'Goal already completed.', completed: true });
    }

    const { amount, note } = req.body;

    const transaction = await SavingsTransaction.create({
      userId: req.userId,
      goalId: goal._id,
      amount,
      type: 'deposit',
      status: 'pending',
      note: (note || '').trim()
    });

    res.status(201).json({
      message: 'Savings added. It will be reflected in your total once you confirm the deposit.',
      transaction,
      goal: appendGoalView(goal),
      pending: true
    });
  } catch (err) {
    res.status(500).json({ error: 'Error adding savings' });
  }
});

router.post('/:id/savings/:transactionId/confirm', async (req, res) => {
  try {
    const { code } = req.body;
    const transaction = await SavingsTransaction.findOne({
      _id: req.params.transactionId,
      goalId: req.params.id,
      userId: req.userId,
      type: 'deposit',
      status: 'pending'
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Pending savings not found' });
    }

    const user = await require('../models/User').findById(req.userId);
    if (!code) {
      await createAndSendOtp(user.email, 'withdrawal');
      return res.json({
        message: 'A confirmation code has been sent to your email.',
        confirmRequired: true,
        transactionId: transaction._id
      });
    }

    const result = await verifyOtp(user.email, code, 'withdrawal');
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    transaction.status = 'confirmed';
    await transaction.save();
    await updateGoalFromTransactions(req.params.id, req.userId);
    checkAndNotifyMilestones(req.params.id, req.userId);

    const goal = await SavingsGoal.findById(req.params.id);
    res.json({
      message: 'Savings confirmed successfully.',
      transaction,
      goal: appendGoalView(goal),
      confirmed: true
    });
  } catch (err) {
    res.status(500).json({ error: 'Error confirming savings' });
  }
});

router.post('/:id/withdraw', async (req, res) => {
  try {
    const { amount, code } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Withdrawal amount must be greater than 0' });
    }

    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    if (goal.isLocked) {
      return res.status(403).json({ error: 'This goal is locked and cannot be withdrawn from.' });
    }

    const confirmed = await SavingsTransaction.aggregate([
      { $match: { goalId: goal._id, userId: req.userId, status: 'confirmed', type: 'deposit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const deposits = confirmed[0] ? confirmed[0].total : 0;
    const withdrawals = (await SavingsTransaction.aggregate([
      { $match: { goalId: goal._id, userId: req.userId, status: 'confirmed', type: 'withdrawal' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])[0]) || { total: 0 };
    const withdrawTotal = withdrawals.total || 0;
    const available = deposits - withdrawTotal;

    if (amount > available) {
      return res.status(400).json({ error: `You can withdraw up to NPR ${available.toLocaleString()}` });
    }

    const user = await require('../models/User').findById(req.userId);
    if (!code) {
      await createAndSendOtp(user.email, 'withdrawal');
      return res.json({
        message: 'A confirmation code has been sent to your email to approve this withdrawal.',
        confirmRequired: true,
        amount
      });
    }

    const result = await verifyOtp(user.email, code, 'withdrawal');
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    await SavingsTransaction.create({
      userId: req.userId,
      goalId: goal._id,
      amount,
      type: 'withdrawal',
      status: 'confirmed',
      note: (req.body.note || 'Withdrawal').trim()
    });
    await updateGoalFromTransactions(req.params.id, req.userId);

    const updated = await SavingsGoal.findById(req.params.id);
    res.json({ message: 'Withdrawal completed successfully.', goal: appendGoalView(updated) });
  } catch (err) {
    res.status(500).json({ error: 'Error processing withdrawal' });
  }
});

router.get('/:id/transactions', async (req, res) => {
  try {
    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const query = { goalId: req.params.id, userId: req.userId };
    const { type, status, dateFrom, dateTo, search, sortBy, sortDir } = req.query;

    if (type && ['deposit', 'withdrawal'].includes(type)) {
      query.type = type;
    }
    if (status && ['pending', 'confirmed', 'cancelled'].includes(status)) {
      query.status = status;
    }
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }
    if (search) {
      query.note = { $regex: search, $options: 'i' };
    }

    const sortField = sortBy === 'amount' ? 'amount' : 'date';
    const sortOrder = sortDir === 'asc' ? 1 : -1;

    const transactions = await SavingsTransaction.find(query)
      .sort({ [sortField]: sortOrder })
      .lean();

    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching transactions' });
  }
});

module.exports = router;
