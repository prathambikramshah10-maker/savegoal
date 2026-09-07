const crypto = require('crypto');
const Otp = require('../models/Otp');
const { sendOtpEmail } = require('./mailer');

function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

async function createAndSendOtp(email, purpose = 'login') {
  const code = generateCode();
  await Otp.deleteMany({ email, purpose });
  await Otp.create({
    email,
    code,
    purpose,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });
  await sendOtpEmail(email, code, purpose);
  return code;
}

async function verifyOtp(email, code, purpose = 'login') {
  email = (email || '').toLowerCase().trim();
  const record = await Otp.findOne({ email, purpose, used: false })
    .sort({ createdAt: -1 });

  if (!record) {
    return { valid: false, error: 'No verification code found. Please request a new one.' };
  }

  if (record.expiresAt < new Date()) {
    return { valid: false, error: 'Verification code has expired. Please request a new one.' };
  }

  if (record.attempts >= 5) {
    return { valid: false, error: 'Too many incorrect attempts. Please request a new code.' };
  }

  if (record.code !== code.trim()) {
    record.attempts += 1;
    await record.save();
    return { valid: false, error: 'Incorrect verification code.' };
  }

  record.used = true;
  await record.save();
  return { valid: true };
}

module.exports = { createAndSendOtp, verifyOtp };
