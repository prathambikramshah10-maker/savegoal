const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { registerSchema, loginSchema } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');
const { createAndSendOtp, verifyOtp } = require('../utils/otp');

const router = express.Router();

const otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: 'Too many code requests. Please try again later.' }
});

const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: 'Too many verification attempts. Please try again later.' }
});

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

/* ============================================================
   Email OTP Sign-in
   ============================================================ */

router.post('/otp/send', otpSendLimiter, async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const user = await User.findOne({ email });
    const genericResponse = {
      message: 'If an account exists with that email, a verification code has been sent.',
      cooldownMs: 60000,
      expiresInMin: 5
    };

    if (!user) {
      return res.json(genericResponse);
    }

    const result = await createAndSendOtp(email, 'login');
    const payload = {
      message: 'A 6-digit verification code has been sent to your email.',
      cooldownMs: result.cooldownMs,
      expiresInMin: result.expiresInMin,
      remainingSends: result.remainingSends
    };
    if (result.devCode) payload.devCode = result.devCode;

    res.json(payload);
  } catch (err) {
    if (err.code === 'OTP_COOLDOWN') {
      return res.status(429).json({ error: err.message, cooldownMs: err.cooldownMs });
    }
    if (err.code === 'OTP_RATE_LIMIT') {
      return res.status(429).json({ error: err.message });
    }
    res.status(500).json({ error: 'Could not send verification code. Please try again.' });
  }
});

router.post('/otp/verify', otpVerifyLimiter, async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const code = (req.body.code || '').trim();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Verification code must be a 6-digit number' });
    }

    const result = await verifyOtp(email, code, 'login');
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email. Please register first.' });
    }

    const token = generateToken(user._id, user.role);

    res.json({
      message: 'Signed in successfully.',
      token,
      user: publicUser(user),
      role: user.role
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: 'Could not verify code. Please try again.' });
  }
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

    let result;
    try {
      result = await createAndSendOtp(user.email, 'login');
    } catch (err) {
      if (err.code === 'OTP_COOLDOWN') {
        return res.status(429).json({ error: err.message, cooldownMs: err.cooldownMs });
      }
      if (err.code === 'OTP_RATE_LIMIT') {
        return res.status(429).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Could not send verification code. Please try again.' });
    }

    const payload = {
      status: 'otp',
      message: `Password correct. A verification code was sent to ${user.email}.`,
      cooldownMs: result.cooldownMs,
      expiresInMin: result.expiresInMin,
      remainingSends: result.remainingSends
    };
    if (result.devCode) payload.devCode = result.devCode;

    res.json(payload);
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

    if (name !== undefined) {
      if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' });
      }
      user.name = name.trim();
    }
    if (phone !== undefined) {
      if (!phone || !/^[\d+\-\s]{7,20}$/.test(String(phone))) {
        return res.status(400).json({ error: 'Valid phone number is required' });
      }
      user.phone = String(phone).trim();
    }

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

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many reset requests. Please try again later.' }
});

router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({
        message: 'If an account with that email exists, a verification code has been sent.',
        expiresInMin: 5,
        cooldownMs: 60000
      });
    }

    try {
      const result = await createAndSendOtp(user.email, 'reset');
      const payload = {
        message: 'If an account with that email exists, a verification code has been sent.',
        expiresInMin: result.expiresInMin,
        cooldownMs: result.cooldownMs
      };
      if (result.devCode) payload.devCode = result.devCode;
      res.json(payload);
    } catch (err) {
      if (err.code === 'OTP_COOLDOWN') {
        return res.status(429).json({ error: err.message, cooldownMs: err.cooldownMs });
      }
      if (err.code === 'OTP_RATE_LIMIT') {
        return res.status(429).json({ error: err.message });
      }
      res.status(500).json({ error: 'Could not send verification code. Please try again.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error processing password reset' });
  }
});

router.post('/reset-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Verification code must be a 6-digit number' });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const result = await verifyOtp(email, code, 'reset');
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.passwordHash = newPassword;
    await user.save();

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error resetting password' });
  }
});

module.exports = router;
