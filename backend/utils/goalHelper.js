const SavingsGoal = require('../models/SavingsGoal');
const SavingsTransaction = require('../models/SavingsTransaction');

async function updateGoalFromTransactions(goalId, userId) {
  const goal = await SavingsGoal.findOne({ _id: goalId, userId });
  if (!goal) return null;

  const result = await SavingsTransaction.aggregate([
    { $match: { goalId: goal._id, userId, status: 'confirmed' } },
    {
      $group: {
        _id: null,
        deposits: { $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0] } },
        withdrawals: { $sum: { $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0] } }
      }
    }
  ]);

  const row = result[0] || { deposits: 0, withdrawals: 0 };
  const newAmount = Math.max(0, row.deposits - row.withdrawals);

  goal.currentAmount = Math.min(newAmount, goal.targetAmount);
  goal.status = goal.currentAmount >= goal.targetAmount ? 'completed' : 'active';
  await goal.save();
  return goal;
}

module.exports = { updateGoalFromTransactions };
