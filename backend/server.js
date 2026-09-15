const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

const authRoutes = require('./routes/auth');
const goalRoutes = require('./routes/goals');
const transactionRoutes = require('./routes/transactions');
const adminRoutes = require('./routes/admin');
const contactRoutes = require('./routes/contact');
const { runSavingsReminders } = require('./utils/reminders');

const app = express();
const PORT = process.env.PORT || 5000;

// Render/Heroku terminate TLS at a reverse proxy; trust one hop so the real
// client IP (used by rate limiters) and req.protocol resolve correctly.
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

// Enforce HTTPS in production (Render/Heroku terminate TLS at proxy)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const forwarded = req.get('x-forwarded-proto');
    if (forwarded && forwarded !== 'https') {
      return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
    }
    next();
  });
}

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login/registration attempts. Please try again later.' }
});

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5500,http://127.0.0.1:3000,http://127.0.0.1:5500')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (process.env.RENDER_EXTERNAL_URL) {
  try {
    const renderUrl = new URL(process.env.RENDER_EXTERNAL_URL);
    allowedOrigins.push(renderUrl.origin);
  } catch (e) { /* ignore */ }
}

if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  allowedOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  allowedOrigins.push(`https://www.${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const reqHost = req.hostname || req.get('x-forwarded-host') || req.get('host');
      const originNoPort = new URL(origin).hostname;
      const reqNoPort = (req.hostname || '').split(':')[0];
      if ((originHost === reqHost || originNoPort === reqNoPort) && !allowedOrigins.includes(origin)) {
        allowedOrigins.push(origin);
      }
    } catch (e) { /* ignore malformed origin */ }
  }
  next();
});

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (process.env.NODE_ENV === 'development') return cb(null, true);
    return cb(new Error('CORS origin not allowed'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(mongoSanitize());
app.use('/api', globalLimiter);
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/goals', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const frontendDir = path.resolve(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(frontendDir, '404.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.message === 'CORS origin not allowed') {
    return res.status(403).json({ error: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid identifier format' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

async function bootstrapAdmin() {
  try {
    const User = require('./models/User');
    const email = (process.env.ADMIN_EMAIL || 'admin@savegoal.com').toLowerCase();
    const existing = await User.findOne({ email });
    if (!existing) {
      await User.create({
        name: process.env.ADMIN_NAME || 'Admin',
        email,
        phone: process.env.ADMIN_PHONE || '9800000000',
        passwordHash: process.env.ADMIN_PASSWORD || 'admin12345',
        role: 'admin'
      });
      console.log(`Admin account created: ${email}`);
    }
  } catch (e) {
    console.error('Error bootstrapping admin:', e.message);
  }
}

async function connectWithRetry() {
  const uri = process.env.MONGODB_URI;
  while (true) {
    try {
      await mongoose.connect(uri);
      console.log('Connected to MongoDB');
      return;
    } catch (err) {
      console.error('MongoDB connection error:', err.message);
      console.error('Retrying connection in 3 seconds...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

async function start() {
  await connectWithRetry();
  try {
    await bootstrapAdmin();
  } catch (e) {
    console.error('Admin bootstrap error:', e.message);
  }
  const server = app.listen(PORT, () => {
    console.log(`SaveGoal server running on port ${PORT}`);
  });

  // Weekly savings reminders (every 6 hours, first run after 60s)
  const REMINDER_INTERVAL = 6 * 60 * 60 * 1000;
  setTimeout(runSavingsReminders, 60 * 1000);
  setInterval(runSavingsReminders, REMINDER_INTERVAL);

  // Graceful shutdown for platforms (Render/Railway) that send SIGTERM
  const shutdown = () => {
    console.log('Shutting down gracefully...');
    server.close(() => {
      mongoose.connection.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();

module.exports = app;
