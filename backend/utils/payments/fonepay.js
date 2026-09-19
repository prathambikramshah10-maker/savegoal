const crypto = require('crypto');

/* FonePay (Nepal) - used by most Nepali banks (NMB, Nabil, etc.) for QR /.
   Docs: https://developer.fonepay.com
   Environments:
     - Sandbox/QA:  base https://qa.fonepay.com/api/fonepay   (merchant on QA board)
     - Production:  base https://api.fonepay.com/api/fonepay (your merchant code)
   The QA board requires a merchant application (FonePay grants you a test
   merchant code + secret). Production uses the merchant code issued when you
   onboard. Set FONEPAY_SANDBOX=true to use the QA board, and FONEPAY_MERCHANT_CODE
   + FONEPAY_SECRET_KEY with the keys you were issued. */

function isSandbox() {
  return String(process.env.FONEPAY_SANDBOX || '').toLowerCase() === 'true';
}

function baseUrl() {
  return isSandbox() ? 'https://qa.fonepay.com/api/fonepay' : 'https://api.fonepay.com/api/fonepay';
}

function merchantCode() {
  return process.env.FONEPAY_MERCHANT_CODE || null;
}

function secret() {
  return process.env.FONEPAY_SECRET_KEY || null;
}

function isConfigured() {
  return Boolean(merchantCode() && secret());
}

/* FonePay signs the "request message" (the comma-joined set of fields the
   merchant declares) using HMAC-SHA256 base64'd with the shared secret. Which
   fields are signed is controlled by the `request` fields we send and by
   `checksum` fields returned. We default to the common set used by banks. */
const DEFAULT_REQUEST_FIELDS = [
  'MERCHANT_CODE',
  'APR',
  'TXN_AMT',
  'AMT',
  'TXN_REFERENCE_ID',
  'IDP',
  'CRM',
  'CRT'
];

function buildSignature(message, secretKey) {
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

/* FonePay initiation is a form POST to the merchant URL (sandbox or prod).
   `returnUrl` is where FonePay sends the payer back after the transaction.
   We build the full body the merchant would POST, including the signature. */
async function initiate({ amountNpr, returnUrl, txnReferenceId, purchaseLabel }) {
  if (!isConfigured()) {
    const err = new Error('FonePay is not configured. Set FONEPAY_MERCHANT_CODE and FONEPAY_SECRET_KEY.');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }
  const amountStr = String(amountNpr);
  const body = {
    MERCHANT_CODE: merchantCode(),
    APR: amountStr,      // Actual Payment Received (the real amount)
    TXN_AMT: amountStr,  // Total Transaction Amount
    AMT: amountStr,      // Amount to be paid
    TXN_REFERENCE_ID: String(txnReferenceId),
    IDP: '2',            // Initiator Destination Platform
    CRM: String(purchaseLabel || ''), // Caller/Return Message
    CRT: returnUrl,      // Caller Return URL
    REQ_SIGNATURE: buildSignature(
      [merchantCode(), amountStr, amountStr, amountStr, String(txnReferenceId)],
      secret()
    )
  };

  /* FonePay's initiate is a browser redirect (full-page form POST the merchant
     sends to FonePay; there is no JSON initiate). The payment happens on
     FonePay's page/user's bank QR and the user returns to `CRT` (returnUrl). */
  const formUrl = `${baseUrl()}/epayment`;
  return {
    paymentUrl: formUrl,     // FonePay's form action / full payment page
    body,                    // merchant fields to POST (used by frontend to build form)
    redirectMethod: 'POST',
    requiresVerification: true
  };
}

/* FonePay returns the user to the configured return URL with `fppid`, `prn`,
   `token`, `espmsg` etc. as query params + a signature. To verify server-side
   we post the PRN (Payment Reference Number) to FonePay's verification
   endpoint; if valid it returns the transaction details we can trust. */
async function verify({ gatewayReference }) {
  if (!isConfigured()) {
    const err = new Error('FonePay is not configured. Set FONEPAY_MERCHANT_CODE and FONEPAY_SECRET_KEY.');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }

  const params = new URLSearchParams({
    PRN: String(gatewayReference),
    MERCHANT_CODE: merchantCode()
  });

  const verifyRes = await fetch(`${baseUrl()}/merchantRequest/count`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const rawText = await verifyRes.text();
  let data = {};
  try { data = rawText ? JSON.parse(rawText) : {}; } catch (_) { /* non-JSON */ }

  /* The /count endpoint returns { total_count, total_amount, ... } when the
     PRN is confirmed. Treat total_count >= 1 as confirmation it was paid. */
  const count = Number(data.total_count || data.totalCount || data.count || 0);
  if (verifyRes.ok && count > 0) {
    return {
      valid: true,
      refId: String(gatewayReference),
      amount: Number(data.total_amount || data.totalAmount || 0),
      data
    };
  }
  return { valid: false, status: verifyRes.status, error: 'FonePay could not confirm this reference.', data };
}

module.exports = {
  name: 'fonepay',
  label: 'FonePay',
  isConfigured,
  initiate,
  verify
};
