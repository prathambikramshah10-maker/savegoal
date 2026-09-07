const mongoose = require('mongoose');

const savingsGoalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Goal name is required'],
      trim: true,
      maxlength: [200, 'Goal name cannot exceed 200 characters']
    },
    targetAmount: {
      type: Number,
      required: [true, 'Target amount is required'],
      min: [1, 'Target amount must be greater than 0']
    },
    currentAmount: {
      type: Number,
      default: 0,
      min: [0, 'Current amount cannot be negative']
    },
    targetDate: {
      type: Date,
      required: [true, 'Target date is required']
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: [
        'Emergency Fund',
        'Education',
        'Travel',
        'Phone',
        'Laptop',
        'Car',
        'House',
        'Other'
      ]
    },
    description: {
      type: String,
      default: '',
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    status: {
      type: String,
      enum: ['active', 'completed'],
      default: 'active'
    },
    isLocked: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

savingsGoalSchema.index({ userId: 1, status: 1 });
savingsGoalSchema.index({ userId: 1, createdAt: -1 });

savingsGoalSchema.virtual('percentage').get(function () {
  if (this.targetAmount <= 0) return 0;
  return Math.min(100, Math.round((this.currentAmount / this.targetAmount) * 100));
});

savingsGoalSchema.virtual('remaining').get(function () {
  return Math.max(0, this.targetAmount - this.currentAmount);
});

savingsGoalSchema.set('toJSON', { virtuals: true });
savingsGoalSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('SavingsGoal', savingsGoalSchema);
