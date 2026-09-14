const SavingsGoal = require('../models/SavingsGoal');
const SavingsTransaction = require('../models/SavingsTransaction');
const User = require('../models/User');
const { sendMail, isConfigured } = require('./mailer');

const REMINDER_DAYS = 7;

async function runSavingsReminders() {
  if (!isConfigured()) {
    console.log('[reminders] Email not configured; skipping reminders.');
    return;
  }

  try {
    const users = await User.find({}).lean();
    const now = new Date();
    let sent = 0;

    for (const user of users) {
      const activeGoals = await SavingsGoal.countDocuments({ userId: user._id, status: 'active' });
      if (activeGoals === 0) continue;

      const last = await SavingsTransaction.findOne({
        userId: user._id,
        status: 'confirmed',
        type: 'deposit'
      }).sort({ date: -1 }).select('date').lean();

      const lastDate = last ? new Date(last.date) : null;
      if (lastDate && (now - lastDate) < REMINDER_DAYS * 24 * 60 * 60 * 1000) continue;
      if (!lastDate && activeGoals) {
        const created = user.createdAt ? new Date(user.createdAt) : null;
        if (created && (now - created) < REMINDER_DAYS * 24 * 60 * 60 * 1000) continue;
      }

      const lastReminder = user.lastReminderSentAt ? new Date(user.lastReminderSentAt) : null;
      if (lastReminder && (now - lastReminder) < REMINDER_DAYS * 24 * 60 * 60 * 1000) continue;

      try {
        const firstName = (user.name || '').split(' ')[0] || 'there';
        await sendMail({
          to: user.email,
          subject: `A gentle nudge, ${firstName} — when was your last save? 🐷`,
          html: `
            <div style="font-family:Arial,sans-serif;background:#0B0D0F;padding:32px;border-radius:16px;max-width:480px;margin:auto;border:1px solid #292D31;">
              <div style="text-align:center;margin-bottom:24px;">
                <span style="background:linear-gradient(135deg,#D4AF6A,#9C8050);color:#0B0D0F;font-size:1.4rem;font-weight:700;padding:10px 16px;border-radius:12px;">SG</span>
              </div>
              <h2 style="color:#F5F1E8;margin-bottom:8px;">Hi ${firstName}! 👋</h2>
              <p style="color:#A9A49A;font-size:0.95rem;">It's been a little while since your last deposit. You have <strong style="color:#D4AF6A;">${activeGoals}</strong> active ${activeGoals === 1 ? 'goal' : 'goals'} waiting for you.</p>
              <p style="color:#A9A49A;font-size:0.95rem;">Even a small amount keeps your streak alive and your savings on track.</p>
              <div style="text-align:center;margin:28px 0;">
                <a href="https://savegoal-br74.onrender.com/dashboard.html" style="background:#D4AF6A;color:#0B0D0F;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Open My Dashboard</a>
              </div>
              <p style="color:#6B6860;font-size:0.8rem;">You'll only get this reminder once a week, and only when there's been no saving activity for a while.</p>
            </div>
          `,
          text: `Hi ${firstName}! It's been a little while since your last SaveGoal deposit. You have ${activeGoals} active goal(s). Open your dashboard to keep your streak alive.`
        });
        await User.updateOne({ _id: user._id }, { $set: { lastReminderSentAt: now } });
        sent += 1;
        console.log(`[reminders] Sent to ${user.email}`);
      } catch (e) {
        console.log(`[reminders] Failed for ${user.email}: ${e.message}`);
      }
    }

    console.log(`[reminders] Run complete. Sent ${sent} reminder(s).`);
  } catch (e) {
    console.log('[reminders] Run error:', e.message);
  }
}

module.exports = { runSavingsReminders };