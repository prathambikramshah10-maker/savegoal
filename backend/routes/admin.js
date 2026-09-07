const express = require('express');
const User = require('../models/User');
const SavingsGoal = require('../models/SavingsGoal');
const SavingsTransaction = require('../models/SavingsTransaction');
const admin = require('../middleware/admin');

const router = express.Router();

router.use(admin);

router.get('/overview', async (req, res) => {
  try {
    const [users, goals, transactions, completed] = await Promise.all([
      User.countDocuments(),
      SavingsGoal.countDocuments(),
      SavingsTransaction.countDocuments(),
      SavingsGoal.countDocuments({ status: 'completed' })
    ]);
    res.json({
      users,
      goals,
      transactions,
      completedGoals: completed
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching admin overview' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 }).lean();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching users' });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const goals = await SavingsGoal.find({ userId: user._id }).lean();
    res.json({ user, goals });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching user' });
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

module.exports = router;
