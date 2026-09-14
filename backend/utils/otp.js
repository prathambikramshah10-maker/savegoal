const crypto = require('crypto');
const Otp = require('../models/Otp');
const { sendOtpEmail, isConfigured } = require('./mailer');

const OTP_SECRET = process.env.OTP_SECRET || 'dev-otp-secret-change-me-in-production';

const OTP_TTL_MS = 5 * 60 * 1000;          // 5 minute expiry
const RESEND_COOLDOWN_MS = 60 * 1000;      // 60 second resend cooldown
const MAX_SENDS_PER_WINDOW = 5;            // max sends per 10 minutes per email+purpose
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;                    // max wrong attempts per code

function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashCode(code, email, purpose) {
  return crypto
    .createHmac('sha256', OTP_SECRET)
    .update(`${String(purpose).toLowerCase()}:${String(email).toLowerCase().trim()}:${String(code).trim()}`)
    .digest('hex');
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/*
 * Creates, stores (hashed only, never plain text) and emails a 6-digit OTP.
 * Returns metadata for the UI (cooldown/expiry). The code itself is NOT
 * returned except in local development when email is not configured, so the
 * user can test the full flow without sending real mail. Once GMAIL_USER and
 * GMAIL_APP_PASSWORD are set in .env, devCode is never returned.
 */
async function createAndSendOtp(email, purpose = 'login') {
  email = (email || '').toLowerCase().trim();
  if (!email) throw new Error('Email is required');

  const windowStart = new Date(Date.now() - SEND_WINDOW_MS);
  const sendsInWindow = await Otp.countDocuments({
    email,
    purpose,
    createdAt: { $gte: windowStart }
  });
  if (sendsInWindow >= MAX_SENDS_PER_WINDOW) {
    const err = new Error('Too many verification codes requested. Please try again later.');
    err.code = 'OTP_RATE_LIMIT';
    throw err;
  }

  const latest = await Otp.findOne({ email, purpose, used: false }).sort({ createdAt: -1 });
  if (latest) {
    const lastSent = latest.lastSentAt || latest.createdAt;
    const waitMs = RESEND_COOLDOWN_MS - (Date.now() - new Date(lastSent).getTime());
    if (waitMs > 0) {
      const err = new Error(`Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting a new code.`);
      err.code = 'OTP_COOLDOWN';
      err.cooldownMs = waitMs;
      throw err;
    }
  }

  const code = generateCode();

  if (latest) {
    latest.codeHash = hashCode(code, email, purpose);
    latest.expiresAt = new Date(Date.now() + OTP_TTL_MS);
    latest.attempts = 0;
    latest.used = false;
    latest.lastSentAt = new Date();
    await latest.save();
  } else {
    await Otp.create({
      email,
      codeHash: hashCode(code, email, purpose),
      purpose,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      lastSentAt: new Date()
    });
  }

  await sendOtpEmail(email, code, purpose);

  const result = {
    cooldownMs: RESEND_COOLDOWN_MS,
    expiresInMin: OTP_TTL_MS / 60000,
    remainingSends: Math.max(0, MAX_SENDS_PER_WINDOW - sendsInWindow - 1)
  };

  if (!isConfigured()) {
    result.devCode = code;
    result.devNote = 'Email SMTP is not configured yet. This code is shown only in development.';
  }

  return result;
}

async function verifyOtp(email, code, purpose = 'login') {
  email = (email || '').toLowerCase().trim();
  const record = await Otp.findOne({ email, purpose, used: false }).sort({ createdAt: -1 });

  if (!record) {
    return { valid: false, error: 'No verification code found. Please request a new one.' };
  }
  if (record.expiresAt < new Date()) {
    return { valid: false, error: 'Verification code expired. Please request a new one.' };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    return { valid: false, error: 'Too many incorrect attempts. Please request a new code.' };
  }
  if (!code || !safeEqual(hashCode(code, email, purpose), record.codeHash)) {
    record.attempts += 1;
    await record.save();
    return { valid: false, error: 'Incorrect verification code.' };
  }

  record.used = true;
  await record.save();
  return { valid: true };
}

module.exports = { createAndSendOtp, verifyOtp, generateCode, MAX_ATTEMPTS, OTP_TTL_MS };