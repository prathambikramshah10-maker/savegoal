const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    code: {
      type: String,
      required: true
    },
    purpose: {
      type: String,
      enum: ['login', 'register', 'withdrawal', 'admin'],
      default: 'login'
    },
    expiresAt: {
      type: Date,
      required: true
    },
    used: {
      type: Boolean,
      default: false
    },
    attempts: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

otpSchema.index({ email: 1, purpose: 1, createdAt: -1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
