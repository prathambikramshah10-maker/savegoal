const mongoose = require('mongoose');

const savingsTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SavingsGoal',
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0']
    },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal'],
      default: 'deposit'
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending'
    },
    date: {
      type: Date,
      default: Date.now
    },
    note: {
      type: String,
      default: '',
      maxlength: [500, 'Note cannot exceed 500 characters']
    }
  },
  { timestamps: true }
);

savingsTransactionSchema.index({ goalId: 1, date: -1 });
savingsTransactionSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('SavingsTransaction', savingsTransactionSchema);
