require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const goalRoutes = require('./routes/goals');
const transactionRoutes = require('./routes/transactions');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

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

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  allowedOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  allowedOrigins.push(`https://www.${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (process.env.NODE_ENV === 'development' && origin === 'null') return cb(null, true);
    return cb(new Error('CORS origin not allowed'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));
app.use('/api', globalLimiter);
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/goals', transactionRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const frontendDir = path.resolve(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

app.get('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
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

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await bootstrapAdmin();
    app.listen(PORT, () => {
      console.log(`SaveGoal server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

module.exports = app;
