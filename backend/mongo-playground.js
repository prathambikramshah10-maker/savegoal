// ============================================================
// SaveGoal - MongoDB Playground Script
// Run with:  node mongo-playground.js
// This shows how Node.js reads & writes MongoDB directly.
// ============================================================

const mongoose = require('./node_modules/mongoose');

// MongoDB connection (same as backend/.env)
const MONGODB_URI = 'mongodb://localhost:27017/savegoal';

async function main() {
  try {
    // 1. CONNECT
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB: ' + MONGODB_URI);

    // 2. DEFINE COLLECTIONS (same schema as models/)
    const User = mongoose.model('User', new mongoose.Schema({
      name: String,
      email: String,
      phone: String,
      passwordHash: String
    }, { timestamps: true }));

    const Goal = mongoose.model('SavingsGoal', new mongoose.Schema({
      userId: mongoose.Types.ObjectId,
      name: String,
      targetAmount: Number,
      currentAmount: Number,
      targetDate: Date,
      category: String,
      description: String,
      status: String
    }, { timestamps: true }));

    const Transaction = mongoose.model('SavingsTransaction', new mongoose.Schema({
      userId: mongoose.Types.ObjectId,
      goalId: mongoose.Types.ObjectId,
      amount: Number,
      date: Date,
      note: String
    }, { timestamps: true }));

    // 3. READ - Show all existing data
    console.log('\n🔄 Current data in MongoDB:');

    const users = await User.find();
    console.log(`\n📂 users collection (${users.length}):`);
    users.forEach(u => {
      console.log(`   - ${u.name} (${u.email})`);
    });

    const goals = await Goal.find();
    console.log(`\n📂 savingsgoals collection (${goals.length}):`);
    goals.forEach(g => {
      const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
      console.log(`   - ${g.name}: ${g.currentAmount}/${g.targetAmount} (${pct}%) [${g.status}]`);
    });

    const txs = await Transaction.find();
    console.log(`\n📂 savingstransactions collection (${txs.length}):`);
    txs.forEach(t => {
      console.log(`   - ${t.note || 'Savings'}: +${t.amount}`);
    });

    // 4. WRITE - Add a new goal via Node.js
    console.log('\n✍️  Writing a new goal to MongoDB via Node.js...');
    const mainUser = users[0] || await User.create({
      name: 'Demo User',
      email: 'demo@savegoal.com',
      phone: '9800000000',
      passwordHash: 'hashed-password-here'
    });

    const newGoal = await Goal.create({
      userId: mainUser._id,
      name: 'Emergency Fund',
      targetAmount: 50000,
      currentAmount: 0,
      targetDate: new Date('2027-01-01'),
      category: 'Emergency Fund',
      description: 'Safety net for unexpected expenses',
      status: 'active'
    });
    console.log('✅ New goal created:', newGoal.name, '(id:', newGoal._id + ')');

    // 5. WRITE - Add a transaction to that goal
    console.log('✍️  Adding a savings transaction via Node.js...');
    await Transaction.create({
      userId: mainUser._id,
      goalId: newGoal._id,
      amount: 10000,
      date: new Date(),
      note: 'First emergency fund deposit'
    });
    console.log('✅ Transaction added: +10000 to ' + newGoal.name);

    // 6. UPDATE - Update the goal currentAmount
    console.log('✍️  Updating goal currentAmount via Node.js...');
    await Goal.findByIdAndUpdate(newGoal._id, { currentAmount: 10000 });
    console.log('✅ Goal updated: currentAmount is now 10000 (20%)');

    console.log('\n🎉 Done! Refresh MongoDB Compass to see the new data!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
