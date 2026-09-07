const nodemailer = require('nodemailer');

const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

const transporter = gmailUser && gmailAppPassword
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailAppPassword }
    })
  : null;

function isConfigured() {
  return transporter !== null;
}

async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.log('\n==========================================');
    console.log(`[SaveGoal Mail Dev Mode - real email not configured]`);
    console.log(`TO:   ${to}`);
    console.log(`SUBJ: ${subject}`);
    console.log('---');
    console.log(text || 'No plain text provided.');
    console.log('==========================================\n');
    return;
  }
  await transporter.sendMail({
    from: `"SaveGoal" <${gmailUser}>`,
    to,
    subject,
    html,
    text
  });
}

async function sendOtpEmail(to, code, purpose) {
  const purposeText = purpose === 'register'
    ? 'Verify your email address'
    : 'Your login verification code';
  const subject = `Your SaveGoal ${purpose === 'register' ? 'Verification' : 'Login'} Code`;
  await sendMail({
    to,
    subject,
    text: `Your SaveGoal code is: ${code}. It expires in 10 minutes. If you did not request this, please ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#0B0D0F;padding:32px;border-radius:16px;max-width:480px;margin:auto;border:1px solid #292D31;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="background:linear-gradient(135deg,#D4AF6A,#9C8050);color:#0B0D0F;font-size:1.4rem;font-weight:700;padding:10px 16px;border-radius:12px;">SG</span>
        </div>
        <h2 style="color:#F5F1E8;margin-bottom:8px;">${purposeText}</h2>
        <p style="color:#A9A49A;font-size:0.95rem;">Use the code below to continue. It expires in <strong style="color:#D4AF6A;">10 minutes</strong>.</p>
        <div style="font-size:2.2rem;letter-spacing:8px;color:#D4AF6A;font-weight:800;text-align:center;margin:24px 0;background:#15191D;padding:20px;border-radius:12px;border:1px solid #292D31;">${code}</div>
        <p style="color:#6B6860;font-size:0.8rem;">If you did not request this code, you can safely ignore this email.</p>
      </div>
    `
  });
}

module.exports = { sendMail, sendOtpEmail, isConfigured };
