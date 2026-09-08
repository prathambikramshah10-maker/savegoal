const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { registerSchema, loginSchema } = require('../middleware/validation');
const { createAndSendOtp, verifyOtp } = require('../utils/otp');
const { isConfigured } = require('../utils/mailer');

const router = express.Router();

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

    if (process.env.OTP_REQUIRED === 'true') {
      const otpCode = await createAndSendOtp(email.toLowerCase(), 'register');

      return res.status(200).json({
        message: 'Verification code sent to your email. Please enter it to complete registration.',
        email: email.toLowerCase(),
        verify: true,
        emailConfigured: isConfigured(),
        devCode: isConfigured() ? undefined : otpCode
      });
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

router.post('/verify-register', async (req, res) => {
  try {
    const { name, email, phone, password, code } = req.body;
    const errors = registerSchema({ name, email, phone, password, confirmPassword: password });
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const result = await verifyOtp(email, code, 'register');
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
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

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (process.env.OTP_REQUIRED === 'true') {
      const otpCode = await createAndSendOtp(email.toLowerCase(), 'login');

      return res.json({
        message: 'Verification code sent to your email. Please enter it to continue.',
        email: email.toLowerCase(),
        verify: true,
        emailConfigured: isConfigured(),
        devCode: isConfigured() ? undefined : otpCode
      });
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

router.post('/verify-login', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email' });
    }

    const result = await verifyOtp(email, code, 'login');
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    const token = generateToken(user._id, user.role);

    res.json({
      message: 'Login successful',
      token,
      user: publicUser(user),
      role: user.role
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login verification' });
  }
});

router.post('/resend-otp', async (req, res) => {
  try {
    const { email, purpose = 'login' } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    await createAndSendOtp(email.toLowerCase(), purpose);
    res.json({ message: 'A new verification code has been sent to your email.' });
  } catch (err) {
    res.status(500).json({ error: 'Error sending verification code' });
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

module.exports = router;
