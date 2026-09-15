const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendMail, isConfigured } = require('../utils/mailer');

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many messages. Please try again later.' }
});

router.post('/', contactLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Please provide your name' });
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!subject || subject.length > 100) {
      return res.status(400).json({ error: 'Please choose a subject' });
    }
    if (!message || message.length < 5 || message.length > 5000) {
      return res.status(400).json({ error: 'Message must be between 5 and 5000 characters' });
    }

    const to = process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL || process.env.GMAIL_USER;
    await sendMail({
      to,
      subject: `[SaveGoal Contact] ${subject}`,
      text: `From: ${name} <${email}>\n\n${message}`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#0B0D0F;padding:24px;border-radius:12px;max-width:560px;margin:auto;border:1px solid #292D31;">
          <h2 style="color:#F5F1E8;margin:0 0 16px;">New contact message</h2>
          <p style="color:#A9A49A;margin:6px 0;"><strong style="color:#F5F1E8;">Name:</strong> ${name}</p>
          <p style="color:#A9A49A;margin:6px 0;"><strong style="color:#F5F1E8;">Email:</strong> ${email}</p>
          <p style="color:#A9A49A;margin:6px 0;"><strong style="color:#F5F1E8;">Subject:</strong> ${subject}</p>
          <div style="margin-top:16px;padding:16px;background:#15191D;border:1px solid #292D31;border-radius:8px;color:#F5F1E8;white-space:pre-wrap;">${message}</div>
        </div>
      `
    });

    res.json({ message: 'Message sent. We will get back to you as soon as possible.' });
  } catch (err) {
    console.error('Contact form error:', err.message);
    if (!isConfigured()) {
      return res.status(500).json({ error: 'Email is not configured on this server yet.' });
    }
    res.status(500).json({ error: 'Could not send your message. Please try again.' });
  }
});

module.exports = router;