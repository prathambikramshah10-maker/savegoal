const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { registerSchema, loginSchema } = require('../middleware/validation');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const router = express.Router();

const failedLogins = new Map();

function recordFailedLogin(email) {
  const key = email.toLowerCase();
  const entry = failedLogins.get(key) || { count: 0, lockedUntil: 0 };
  if (Date.now() > entry.lockedUntil) {
    entry.count = 0;
    entry.lockedUntil = 0;
  }
  entry.count += 1;
  if (entry.count >= 5) {
    entry.lockedUntil = Date.now() + 15 * 60 * 1000;
    entry.count = 0;
  }
  failedLogins.set(key, entry);
}

function isLocked(email) {
  const entry = failedLogins.get(email.toLowerCase());
  if (!entry) return { locked: false };
  if (Date.now() < entry.lockedUntil) {
    const mins = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return { locked: true, mins };
  }
  if (entry.lockedUntil > 0 && Date.now() >= entry.lockedUntil) {
    failedLogins.delete(email.toLowerCase());
  }
  return { locked: false };
}

const generateToken = (userId, role = 'user') => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role
});

router.post('/register', async (req, res) => {
  try {
    const errors = registerSchema(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const { name, email, phone, password } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      passwordHash: password
    });

    const token = generateToken(user._id, user.role);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: publicUser(user)
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const errors = loginSchema(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const { email, password } = req.body;

    const lock = isLocked(email);
    if (lock.locked) {
      return res.status(423).json({ error: `Too many failed attempts. Account locked. Try again in ${lock.mins} minutes.` });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      recordFailedLogin(email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      recordFailedLogin(email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user._id, user.role);

    res.json({
      message: 'Login successful',
      token,
      user: publicUser(user),
      role: user.role
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', auth, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.put('/me', auth, async (req, res) => {
  try {
    const { name, phone, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.userId);

    if (name) user.name = name.trim();
    if (phone) user.phone = phone.trim();

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      user.passwordHash = newPassword;
    }

    await user.save();
    res.json({ message: 'Profile updated successfully', user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

router.delete('/me', auth, async (req, res) => {
  try {
    const SavingsGoal = require('../models/SavingsGoal');
    const SavingsTransaction = require('../models/SavingsTransaction');

    await SavingsTransaction.deleteMany({ userId: req.userId });
    await SavingsGoal.deleteMany({ userId: req.userId });
    await User.findByIdAndDelete(req.userId);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error deleting account' });
  }
});

// Password reset token storage (in-memory for simplicity)
const resetTokens = new Map();

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if user exists
      return res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 30 * 60 * 1000; // 30 minutes
    resetTokens.set(user._id.toString(), { token, expires });

    // Try to send email, but don't fail if email config is missing
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}&id=${user._id}`;

      await transporter.sendMail({
        from: process.env.EMAIL_USER || 'noreply@savegoal.com',
        to: user.email,
        subject: 'SaveGoal - Password Reset',
        html: `<p>Hi ${user.name},</p><p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 30 minutes.</p><p>If you didn't request this, ignore this email.</p>`
      });
    } catch (emailErr) {
      console.log('Email send failed (email not configured):', emailErr.message);
    }

    res.json({ message: 'If an account with that email exists, a reset link has been sent.', resetToken: token, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error processing password reset' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, userId, newPassword } = req.body;

    if (!token || !userId || !newPassword) {
      return res.status(400).json({ error: 'Token, user ID, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const stored = resetTokens.get(userId);
    if (!stored || stored.token !== token) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (Date.now() > stored.expires) {
      resetTokens.delete(userId);
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.passwordHash = newPassword;
    await user.save();
    resetTokens.delete(userId);

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error resetting password' });
  }
});

module.exports = router;
