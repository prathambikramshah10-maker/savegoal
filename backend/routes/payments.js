
const express = require('express');
const router = express.Router();
const PaymentOrder = require('../models/PaymentOrder');
const SavingsGoal = require('../models/SavingsGoal');
const SavingsTransaction = require('../models/SavingsTransaction');
const payments = require('../utils/payments');
const { updateGoalFromTransactions } = require('../utils/goalHelper');
const { checkAndNotifyMilestones } = require('./goals');
const auth = require('../middleware/auth');

router.use(auth);

/* ---- helpers (same money rules as transactions.js) ---- */
const goalLocks = new Map();
function withGoalLock(goalId, fn) {
  const key = String(goalId);
  const prev = goalLocks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  goalLocks.set(key, next);
  next.finally(() => { if (goalLocks.get(key) === next) goalLocks.delete(key); });
  return next;
}

async function getConfirmedBalances(goal) {
  const rows = await SavingsTransaction.aggregate([
    { $match: { goalId: goal._id, userId: goal.userId, status: 'confirmed' } },
    { $group: {
        _id: null,
        deposits: { $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0] } },
        withdrawals: { $sum: { $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0] } }
    } }
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

/* ---- GET /api/payments/gateways : what the UI can offer ---- */
router.get('/gateways', async (req, res) => {
  try {
    res.json({ gateways: payments.configuredGateways() });
  } catch (err) {
    res.status(500).json({ error: 'Error listing payment gateways' });
  }
});

/* ---- POST /api/payments/initiate ----
   Body: { goalId, gateway, amountNpr, note? }
   Validates ownership + goal state + amount <= remaining, then persists a
   PaymentOrder (status created) and calls the registry's initiate(). The ONLY
   thing the client gets back is the redirect info + orderId. */
router.post('/initiate', async (req, res) => {
  try {
    const { goalId, gateway, amountNpr, note } = req.body;
    if (!goalId || !gateway || !amountNpr || Number(amountNpr) <= 0) {
      return res.status(400).json({ error: 'goalId, gateway and a positive amountNpr are required.' });
    }
    if (!payments.isSupported(gateway)) {
      return res.status(400).json({ error: `Unsupported payment gateway: ${gateway}` });
    }

    const goal = await SavingsGoal.findOne({ _id: goalId, userId: req.userId });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (goal.isLocked) return res.status(403).json({ error: 'This goal is locked and cannot accept payments.' });
    if (goal.status === 'completed') return res.status(400).json({ error: 'Goal already completed.', completed: true });

    const amountNprNum = Number(amountNpr);
    const balances = await getConfirmedBalances(goal);
    if (amountNprNum > balances.remaining) {
      return res.status(400).json({
        error: `Amount cannot exceed the remaining NPR ${balances.remaining.toLocaleString()} needed to reach your target.`
      });
    }

    const user = await require('../models/User').findById(req.userId);
    const ctx = {
      amountNpr: amountNprNum,
      orderId: `SG-${goal._id}-${Date.now()}`,
      orderName: `Savings toward ${goal.name || 'your goal'}`,
      customer: { name: user.name || 'SaveGoal user', email: user.email, phone: user.phone || '' },
      returnUrl: (req.body.returnUrl || process.env.WEBSITE_URL || '').replace(/\/$/, ''),
      websiteUrl: process.env.WEBSITE_URL || ''
    };

    const result = await payments.initiate(gateway, ctx);

    const order = await PaymentOrder.create({
      userId: req.userId,
      goalId: goal._id,
      gateway,
      env: String(process.env[`${gateway.toUpperCase()}_SANDBOX`] || '').toLowerCase() === 'true' ? 'sandbox' : 'prod',
      amount: amountNprNum,
      currency: 'NPR',
      status: 'created',
      transactionUuid: ctx.orderId,
      dedupeKey: require('crypto').createHash('sha256').update(`${req.userId}|${goal._id}|${gateway}|${amountNprNum}`).digest('hex'),
      note: (note || '').trim(),
      successUrl: result.returnUrl || ctx.returnUrl || null,
      failureUrl: ctx.returnUrl || null,
      initiateRequest: ctx,
      initiateResponse: result.initiateResponse || result.raw || result,
      gatewayTxnId: result.gatewayOrderId || result.gatewayTxnId || null,
      expiresAt: result.expiresAt ? new Date(result.expiresAt) : new Date(Date.now() + 30 * 60 * 1000)
    });

    res.status(201).json({
      message: 'Payment initiated. Complete it on the gateway page, then return to confirm.',
      orderId: order._id,
      gateway,
      gatewayName: result.paymentUrl ? payments.GATEWAYS?.[gateway]?.label || gateway : gateway,
      amountNpr: amountNprNum,
      redirect: {
        method: result.redirectMethod || (result.paymentUrl ? 'GET' : 'POST'),
        url: result.paymentUrl || result.payment_url || null,
        body: result.body || null
      },
      expiresAt: order.expiresAt
    });
  } catch (err) {
    if (err.code === 'GATEWAY_NOT_CONFIGURED' || err.code === 'UNSUPPORTED_GATEWAY') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Error initiating payment' });
  }
});

/* ---- POST /api/payments/:orderId/verify ----
   SERVER-SIDE verification ONLY. We re-verify with the gateway using the ref
   WE persisted (gatewayOrderId / fields from OUR order), then credit a
   confirmed deposit + update goal + milestones under the goal lock. Invalid
   /unsigned /amount-mismatch -> balance untouched. The order is the identity;
   the gateway's own response is the only source of truth. */
router.post('/:orderId/verify', async (req, res) => {
  try {
    const order = await PaymentOrder.findOne({ _id: req.params.orderId, userId: req.userId });
    if (!order) return res.status(404).json({ error: 'Payment order not found' });
    if (order.status === 'paid') {
      return res.status(200).json({ message: 'Payment already confirmed.', order });
    }
    if (!['created', 'pending'].includes(order.status)) {
      return res.status(400).json({ error: `This order is in state "${order.status}" and cannot be confirmed.` });
    }
    if (order.expiresAt && order.expiresAt < new Date()) {
      order.status = 'expired'; await order.save();
      return res.status(400).json({ error: 'This payment order has expired. Start a new one.' });
    }

    let verified;
    if (order.gateway === 'khalti') {
      if (!order.gatewayTxnId) return res.status(400).json({ error: 'No gateway reference to verify.' });
      verified = await payments.verify('khalti', { gatewayOrderId: order.gatewayTxnId });
    } else if (order.gateway === 'esewa') {
      const fv = order.initiateResponse?.fieldValues || order.initiateResponse || {};
      verified = await payments.verify('esewa', {
        productCode: fv.product_code || process.env.ESEWA_MERCHANT_ID,
        totalAmount: String(order.amount),
        transactionUuid: order.transactionUuid
      });
    } else {
      return res.status(400).json({ error: 'Unsupported gateway for this order.' });
    }

    if (!verified || !verified.valid) {
      order.status = 'failed';
      order.error = (verified && (verified.error || verified.message)) || 'Gateway could not confirm this payment.';
      order.verificationResponse = verified?.raw || verified || null;
      await order.save();
      return res.status(400).json({ error: order.error, verified: false });
    }

    const goalNow = await SavingsGoal.findOne({ _id: order.goalId, userId: req.userId });
    if (!goalNow) { order.status = 'failed'; await order.save(); return res.status(404).json({ error: 'Goal not found' }); }

    return withGoalLock(String(order.goalId), async () => {
      const balances = await getConfirmedBalances(goalNow);
      if (order.amount > balances.remaining) {
        order.status = 'cancelled'; await order.save();
        return res.status(400).json({ error: 'This goal no longer needs that amount. No balance was changed.' });
      }

      const existing = await SavingsTransaction.findOne({
        goalId: goalNow._id, userId: req.userId,
        amount: order.amount, type: 'deposit', status: 'confirmed',
        note: new RegExp(`Gateway ${order.gateway}`, 'i')
      });
      if (existing) {
        order.status = 'paid';
        order.gatewayTxnId = verified.gatewayTxnId || order.gatewayTxnId;
        order.verifiedAt = new Date();
        await order.save();
        return res.json({ message: 'Payment already recorded.', order, alreadyChecked: true });
      }

      const txn = await SavingsTransaction.create({
        userId: req.userId,
        goalId: goalNow._id,
        amount: order.amount,
        type: 'deposit',
        status: 'confirmed',
        note: (order.note || `Gateway ${order.gateway} deposit (${order.gatewayTxnId || ''})`).trim(),
        date: new Date()
      });
      await updateGoalFromTransactions(goalNow._id, req.userId);
      checkAndNotifyMilestones(goalNow._id, req.userId).catch(() => {});

      order.status = 'paid';
      order.gatewayTxnId = verified.gatewayTxnId || order.gatewayTxnId;
      order.confirmedTxnId = txn._id;
      order.verifiedAt = new Date();
      order.verificationResponse = verified.raw || verified || null;
      await order.save();

      const goal = await SavingsGoal.findById(goalNow._id);
      res.json({
        message: 'Payment verified and your savings were added.',
        order,
        goal: goal ? { ...goal.toJSON(), remaining: Math.max(0, goal.targetAmount - goal.currentAmount) } : null,
        verified: true
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error verifying payment' });
  }
});

/* ---- GET /api/payments/:orderId : status poll ---- */
router.get('/:orderId', async (req, res) => {
  try {
    const order = await PaymentOrder.findOne({ _id: req.params.orderId, userId: req.userId });
    if (!order) return res.status(404).json({ error: 'Payment order not found' });
    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching payment' });
  }
});

module.exports = router;


