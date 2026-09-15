const express = require('express');
const SavingsGoal = require('../models/SavingsGoal');
const SavingsTransaction = require('../models/SavingsTransaction');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { savingsSchema } = require('../middleware/validation');
const { createAndSendOtp, verifyOtp } = require('../utils/otp');
const { updateGoalFromTransactions } = require('../utils/goalHelper');
const { checkAndNotifyMilestones } = require('./goals');

const router = express.Router();

const otpActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: 'Too many verification actions. Please try again later.' }
});

const handleOtpSendError = (err, res) => {
  if (err.code === 'OTP_COOLDOWN') {
    return res.status(429).json({ error: err.message, cooldownMs: err.cooldownMs });
  }
  if (err.code === 'OTP_RATE_LIMIT') {
    return res.status(429).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Could not send verification code. Please try again.' });
};

/* Serialize money-mutating operations per goal so concurrent requests cannot
   race past an availability check and overdraw / double-spend. Holds the lock
   in-process; safe for a single-instance deployment. */
const goalLocks = new Map();

function withGoalLock(goalId, fn) {
  const key = String(goalId);
  const prev = goalLocks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  goalLocks.set(key, next);
  next.finally(() => {
    if (goalLocks.get(key) === next) goalLocks.delete(key);
  });
  return next;
}

/* Confirmed balance facts for a goal: raw confirmed deposits/withdrawals plus
   the capped current amount that is displayed to users. */
async function getConfirmedBalances(goal) {
  const rows = await SavingsTransaction.aggregate([
    { $match: { goalId: goal._id, userId: goal.userId, status: 'confirmed' } },
    {
      $group: {
        _id: null,
        deposits: { $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0] } },
        withdrawals: { $sum: { $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0] } }
      }
    }
  ]);
  const row = rows[0] || { deposits: 0, withdrawals: 0 };
  const available = Math.max(0, row.deposits - row.withdrawals);
  return {
    deposits: row.deposits,
    withdrawals: row.withdrawals,
    available,
    remaining: Math.max(0, goal.targetAmount - Math.min(available, goal.targetAmount)),
    currentAmount: Math.min(available, goal.targetAmount)
  };
}

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

    const balances = await getConfirmedBalances(goal);
    if (amount > balances.remaining) {
      return res.status(400).json({
        error: `Amount cannot exceed the remaining NPR ${balances.remaining.toLocaleString()} needed to reach your target.`
      });
    }

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

router.post('/:id/savings/:transactionId/confirm', otpActionLimiter, async (req, res) => {
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
      let otpResult;
      try {
        otpResult = await createAndSendOtp(user.email, 'deposit');
      } catch (err) {
        return handleOtpSendError(err, res);
      }
      const payload = {
        message: 'A 6-digit confirmation code has been sent to your email.',
        confirmRequired: true,
        transactionId: transaction._id,
        cooldownMs: otpResult.cooldownMs,
        expiresInMin: otpResult.expiresInMin
      };
      if (otpResult.devCode) payload.devCode = otpResult.devCode;
      return res.json(payload);
    }

    const result = await verifyOtp(user.email, code, 'deposit');
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

router.post('/:id/withdraw', otpActionLimiter, async (req, res) => {
  try {
    const { amount } = req.body;
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

    // Entire check-then-write sequence goes under the goal lock to prevent
    // two concurrent withdrawals from both passing the availability check.
    return withGoalLock(String(goal._id), async () => {
      const balances = await getConfirmedBalances(goal);
      if (amount > balances.available) {
        return res.status(400).json({ error: `You can withdraw up to NPR ${balances.available.toLocaleString()}` });
      }

      const user = await require('../models/User').findById(req.userId);
      const { code } = req.body;
      if (!code) {
        let otpResult;
        try {
          otpResult = await createAndSendOtp(user.email, 'withdrawal');
        } catch (err) {
          return handleOtpSendError(err, res);
        }
        const payload = {
          message: 'A 6-digit confirmation code has been sent to your email to approve this withdrawal.',
          confirmRequired: true,
          amount,
          cooldownMs: otpResult.cooldownMs,
          expiresInMin: otpResult.expiresInMin
        };
        if (otpResult.devCode) payload.devCode = otpResult.devCode;
        return res.json(payload);
      }

      const result = await verifyOtp(user.email, code, 'withdrawal');
      if (!result.valid) {
        return res.status(400).json({ error: result.error });
      }

      // Re-check availability after the OTP round-trip; the goal may have
      // moved while the user was entering their code.
      const freshBalances = await getConfirmedBalances(goal);
      if (amount > freshBalances.available) {
        return res.status(400).json({ error: `You can withdraw up to NPR ${freshBalances.available.toLocaleString()}` });
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
    });
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
