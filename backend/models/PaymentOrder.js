const mongoose = require('mongoose');

/* A single user-initiated payment against a savings goal through a real
   gateway (Khalti / eSewa). "confirmed"/"paid" orders are created
   ONLY by the server after it independently verifies with the gateway â€” never
   from frontend input. The deposit SavingsTransaction stays 'pending' until
   that verified payment exists, so the goal balance never moves on trust. */
const paymentOrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SavingsGoal',
      required: true,
      index: true
    },
    gateway: {
      type: String,
      enum: ['khalti', 'esewa'],
      required: true
    },
    env: {
      type: String,
      enum: ['sandbox', 'prod'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Amount must be greater than 0']
    },
    currency: {
      type: String,
      default: 'NPR'
    },
    /* Gateway's own transaction reference once known (Khalti pidx, eSewa
       ref_id / transaction_uuid / eSewa transaction_uuid). Unique per gateway. */
    gatewayTxnId: {
      type: String,
      default: null,
      index: true
    },
    transactionUuid: {
      type: String,
      required: true,
      unique: true
    },
    status: {
      type: String,
      enum: ['created', 'pending', 'paid', 'failed', 'cancelled', 'expired'],
      default: 'created'
    },
    /* Deduplication / idempotency fingerprint so a user cannot create two
       identical open orders for the same goal+amount+gateway and only pay once.
       combo = sha256(userId|goalId|amount|gateway|oldestPendingWindow). */
    dedupeKey: {
      type: String,
      required: true,
      index: true
    },
    note: {
      type: String,
      default: ''
    },
    payerName: {
      type: String,
      default: null
    },
    payerEmail: {
      type: String,
      default: null
    },
    payerPhone: {
      type: String,
      default: null
    },
    successUrl: {
      type: String,
      default: null
    },
    failureUrl: {
      type: String,
      default: null
    },
    /* Raw payloads saved for audit + idempotent re-verification. */
    initiateRequest: { type: mongoose.Schema.Types.Mixed, default: null },
    initiateResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    verificationRequest: { type: mongoose.Schema.Types.Mixed, default: null },
    verificationResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    verifiedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    confirmedTxnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SavingsTransaction',
      default: null
    },
    error: { type: String, default: null }
  },
  { timestamps: true }
);

paymentOrderSchema.index({ userId: 1, status: 1 });
paymentOrderSchema.index({ goalId: 1, status: 1 });

module.exports = mongoose.model('PaymentOrder', paymentOrderSchema);




