const crypto = require('crypto');

/* Khalti v2 Payment Gateway.
   Docs: https://docs.khalti.com/khalti-api/payment/
   - Sandbox: use test credentials (public test key "test_secret_key" / "test_public_key")
     against the SAME prod API host; Khalti routes test-key payments to a test
     payment page automaticallyate. Set KHALTI_SANDBOX=true.
   - Production: set KHALTI_SECRET_KEY / KHALTI_PUBLIC_KEY and KHALTI_SANDBOX=false.
   Amounts on the wire are in PAISA (amount NPR * 100) as required by Khalti.
   Authorization header: "Key <secret_key>". */

const PAYMENT_BASE = 'https://khalti.com/api/v2/payment';
const TEST_BASE = 'https://a.khalti.com/api/v2/payment';

function baseUrl() {
  return String(process.env.KHALTI_SANDBOX || '').toLowerCase() === 'true' ? TEST_BASE : PAYMENT_BASE;
}

function secretKey() {
  return process.env.KHALTI_SECRET_KEY || null;
}

function isConfigured() {
  return Boolean(secretKey());
}

/* Create a payment intent. Returns what the merchant needs to continue.
   `returnUrl` is the frontend return URL Khalti redirects the payer to after
   they finish (or cancel) in the wallet. */
async function initiate({ amountNpr, orderId, orderName, customer, returnUrl, websiteUrl }) {
  if (!isConfigured()) {
    const err = new Error('Khalti is not configured. Set KHALTI_SECRET_KEY.');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }

  const fallbackUrl = 'https://savegoal-br74.onrender.com';
  const body = {
    return_url: returnUrl || websiteUrl || fallbackUrl,
    website_url: websiteUrl || fallbackUrl,
    amount: Math.round(amountNpr * 100),
    purchase_order_id: String(orderId),
    purchase_order_name: String(orderName).slice(0, 124),
    customer_info: {
      name: (customer.name || 'SaveGoal user').slice(0, 60),
      email: String(customer.email || '').slice(0, 80),
      phone: String(customer.phone || '')
    }
  };

  const initRes = await fetch(`${baseUrl()}/initiate/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${secretKey()}`
    },
    body: JSON.stringify(body)
  });

  const data = await initRes.json();
  if (!initRes.ok || !data.pidx) {
    const err = new Error(data.detail || data.error || 'Khalti failed to initiate payment.');
    err.code = 'GATEWAY_INIT_FAILED';
    err.status = initRes.status;
    throw err;
  }

  return {
    gatewayOrderId: data.pidx,          // pidx: the payment intent id
    paymentUrl: data.payment_url,
    redirectUrl: data.payment_url,
    returnUrl: returnUrl || websiteUrl || fallbackUrl,
    initiateResponse: data,
    expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null
  };
}

/* Server-side verification loop / one-shot verify. Only a "Completed" status
   returned by Khalti's own API is accepted — never anything the client says.
   Returns the gateway's authoritative payload. */
async function verify({ gatewayOrderId }) {
  if (!isConfigured()) {
    const err = new Error('Khalti is not configured. Set KHALTI_SECRET_KEY.');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }

  const verifyRes = await fetch(`${baseUrl()}/verify/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${secretKey()}`
    },
    body: JSON.stringify({ pidx: gatewayOrderId })
  });

  const data = await verifyRes.json();
  if (!verifyRes.ok) {
    const err = new Error(data.detail || data.error || 'Khalti verification failed.');
    err.code = 'GATEWAY_VERIFY_FAILED';
    err.status = verifyRes.status;
    throw err;
  }
  return data;
}

module.exports = {
  name: 'khalti',
  label: 'Khalti',
  isConfigured,
  initiate,
  verify
};
