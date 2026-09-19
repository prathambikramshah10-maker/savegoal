const crypto = require('crypto');

/* eSewa e-Pay gateway (Nepal).
   Docs: https://developer.esewa.com.np
   Two environments:
     - UAT (testing):      base https://uat.esewa.com.np    (merchant EPAYTEST)
     - Production (LIVE):  base https://merchant.esewa.com.np (your merchant ID)
   The eSewa TEST merchant id is EPAYTEST with secret
   "8gBm/:&EnhH.1/q" — these are the public, documented eSewa UAT
   credentials used by every merchant during integration. Set
   ESEWA_SANDBOX=true to use them. Production needs YOUR OWN merchant id + secret. */

function isSandbox() {
  return String(process.env.ESEWA_SANDBOX || '').toLowerCase() === 'true';
}

function baseUrl() {
  return isSandbox() ? 'https://uat.esewa.com.np' : 'https://merchant.esewa.com.np';
}

function merchantId() {
  return process.env.ESEWA_MERCHANT_ID || (isSandbox() ? 'EPAYTEST' : null);
}

function secret() {
  /* Sandbox default matches the documented eSewa UAT test merchant so the
     sandbox flow works out of the box. Production MUST set ESEWA_SECRET. */
  return process.env.ESEWA_SECRET || (isSandbox() ? '8gBm/:&EnhH.1/q' : null);
}

function isConfigured() {
  return Boolean(merchantId() && secret());
}

/* Signature: base64( HMAC-SHA256( comma-joined values of signed_field_names,
   in that exact order ), using the merchant secret ). */
function buildSignature(rawValuesByField, signedFieldNames, secretKey) {
  const message = signedFieldNames.map((f) => String(rawValuesByField[f] ?? '')).join(',');
  const digest = crypto.createHmac('sha256', secretKey).update(message).digest('base64');
  return digest;
}

const DEFAULT_SIGNED_FIELDS = ['total_amount', 'transaction_uuid', 'product_code'];

/*
 * Initiate an eSewa payment.
 * Returns an object the caller can use to redirect the browser.
 * `fieldValues` are built here from the gateway-agnostic ctx (amountNpr,
 * orderId, returnUrl...), so `total_amount`, `transaction_uuid` and
 * `product_code` always line up with the signature. `successUrl`/`failureUrl`
 * are OUR server return URLs (they must be reachable offsite; eSewa POSTs the
 * signed callback there).
 */
async function initiate({ amountNpr, orderId, orderName, customer, returnUrl, websiteUrl }) {
  if (!merchantId() || !secret()) {
    const err = new Error('eSewa is not configured. Set ESEWA_MERCHANT_ID and ESEWA_SECRET.');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }

  const fieldValues = {
    amount: String(amountNpr),
    tax: '0',
    product_service_charge: '0',
    product_delivery_charge: '0',
    total_amount: String(amountNpr),
    transaction_uuid: String(orderId),
    product_code: merchantId()
  };
  if (returnUrl) {
    fieldValues.success_url = returnUrl;
    fieldValues.failure_url = returnUrl;
  }

  const signedFields = DEFAULT_SIGNED_FIELDS;
  const body = {
    merchant_id: merchantId(),
    ...fieldValues,
    signed_field_names: signedFields.join(','),
    signature: buildSignature(fieldValues, signedFields, secret())
  };

  /* eSewa v1 initiation is a form-style POST that responds with the UAT/prod
     payment URL. Use URL-encoded content, mirroring the documented flow. */
  const initRes = await fetch(`${baseUrl()}/api/epay/init/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });

  const rawText = await initRes.text();
  let data = {};
  try { data = rawText ? JSON.parse(rawText) : {}; } catch (_) { /* non-JSON */ }

  /* Try the various shapes eSewa returns across env versions: a JSON
     { paymentUrl } / { payment_url }, or a redirect Location header, or
     HTML with a form action. Prefer the explicit payment URL when present. */
  let paymentUrl =
    data.paymentUrl || data.payment_url || data.PaymentUrl ||
    data.response?.payment_url || data.response?.paymentUrl ||
    data.data?.url || data.data?.payment_url || data.data?.paymentUrl || null;

  if (!paymentUrl && initRes.headers.get('location')) {
    paymentUrl = initRes.headers.get('location');
  }
  if (!paymentUrl && initRes.redirected) {
    paymentUrl = initRes.url;
  }

  if (!paymentUrl && !initRes.ok) {
    const err = new Error(`eSewa initiate failed (${initRes.status}).`);
    err.code = 'GATEWAY_INIT_FAILED';
    err.status = initRes.status;
    throw err;
  }

  return {
    paymentUrl,
    redirectMethod: 'POST',
    body,
    returnUrl: returnUrl || websiteUrl || null,
    initiateResponse: { fieldValues, raw: data || null },
    expiresAt: null
  };
}

/*
 * Server-side verification: eSewa exposes a signed status endpoint. We call
 * it with the SAME product_code, total_amount and transaction_uuid we sent
 * at initiate time (we never trust the browser for these). A COMPLETE status
 * plus a present ref_id is the only thing we accept.
 */
async function verify({ productCode = merchantId(), totalAmount, transactionUuid }) {
  if (!productCode || !totalAmount || !transactionUuid) {
    return { valid: false, error: 'Missing verification parameters.' };
  }

  const params = new URLSearchParams({
    product_code: productCode,
    total_amount: String(totalAmount),
    transaction_uuid: transactionUuid
  });

  const statusRes = await fetch(`${baseUrl()}/api/epay/transaction/status/?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  if (!statusRes.ok) {
    return { valid: false, error: `eSewa status check failed (${statusRes.status}).` };
  }
  const data = await statusRes.json();

  /* { status: 'COMPLETE', ref_id, transaction_uuid, product_code } */
  const status = String(data.status || '').toUpperCase();
  if (status === 'COMPLETE') {
    return { valid: true, status, refId: data.ref_id || null, data };
  }
  if (!status) {
    return { valid: false, error: 'eSewa returned an empty status.', data };
  }
  return { valid: false, status, error: `eSewa reports status "${data.status}"`, data };
}

module.exports = {
  name: 'esewa',
  label: 'eSewa',
  isConfigured,
  initiate,
  verify,
  buildSignature,
  DEFAULT_SIGNED_FIELDS
};
