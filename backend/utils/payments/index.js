const khalti = require('./khalti');
const esewa = require('./esewa');

/* Payment gateway registry. The route (routes/payments.js) talks ONLY to this
   module — never to an adapter directly — so we can add/remove gateways in one
   place and keep `initiate`/`verify` dispatch consistent even though the two
   adapters have different wire shapes (Khalti JSON+JSON, eSewa signed form
   POST). Current configured gateways: KHALTI + ESEWA only. */

const GATEWAYS = {
  khalti: { ...khalti, configKeys: ['KHALTI_SECRET_KEY'] },
  esewa: {
    ...esewa,
    configKeys: ['ESEWA_MERCHANT_ID', 'ESEWA_SECRET', 'ESEWA_SANDBOX']
  }
};

/* Gateways the current environment has creds for (sandbox or prod). */
function configuredGateways() {
  return Object.entries(GATEWAYS)
    .filter(([, gw]) => gw.isConfigured())
    .map(([key, gw]) => ({ key, label: gw.label, name: gw.name || key }));
}

function isConfigured(gatewayKey) {
  const gw = GATEWAYS[gatewayKey];
  return Boolean(gw && gw.isConfigured());
}

function isSupported(gatewayKey) {
  return Boolean(GATEWAYS[gatewayKey]);
}

/* First configured gateway (the default the UI preselects), else null. */
function firstConfigured() {
  const list = configuredGateways();
  return list.length > 0 ? list[0].key : null;
}

/* Create a payment. The gateway-agnostic ctx is:
     { amountNpr, orderId, orderName, customer, returnUrl, websiteUrl }
   (amount in NPR; khalti converts to paisa itself; esewa builds + signs its
   own fieldValues JSON). We dispatch to each adapter with ONLY the field names
   THAT adapter knows — never a shared blob — so a typo can't silently zero a
   field. Verify args come back from the persisted order, not the browser. */
async function initiate(gatewayKey, ctx) {
  const gw = GATEWAYS[gatewayKey];
  if (!gw) {
    const err = new Error(`Unsupported payment gateway: ${gatewayKey}`);
    err.code = 'UNSUPPORTED_GATEWAY';
    throw err;
  }
  if (!gw.isConfigured()) {
    const err = new Error(
      `${gw.label} is not configured. Set ${gw.configKeys.join(' and ')}.`
    );
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }

  return gw.initiate(ctx);
}

/* Verify a payment server-side. The ONLY source of truth is the gateway's own
   response — callers persist whatever ref the gateway assigned and pass it
   back here. Never trusts the client. Returns normalized:
     { valid, gatewayTxnId, amountNpr, raw }
   or { valid:false, error, raw }. */
async function verify(gatewayKey, {
  gatewayOrderId,
  productCode,
  totalAmount,
  transactionUuid
}) {
  const gw = GATEWAYS[gatewayKey];
  if (!gw) {
    const err = new Error(`Unsupported payment gateway: ${gatewayKey}`);
    err.code = 'UNSUPPORTED_GATEWAY';
    throw err;
  }

  if (gatewayKey === 'khalti') {
    return normalizeVerified(await gw.verify({ gatewayOrderId }));
  }
  if (gatewayKey === 'esewa') {
    return normalizeVerified(
      await gw.verify({ productCode, totalAmount, transactionUuid })
    );
  }
  const err = new Error(`Unsupported gateway for verification: ${gatewayKey}`);
  err.code = 'UNSUPPORTED_GATEWAY';
  throw err;
}

/* Normalize every gateway's verification to ONE shape. khalti returns raw
   payload { status:"Completed", total_amount (PAISA), transaction_id };
   esewa returns { valid, status, refId, data }. */
function normalizeVerified(result) {
  if (!result) {
    return { valid: false, error: 'Gateway returned nothing readable.', raw: result };
  }
  if (result.valid === true || result.valid === false) {
    return result.valid
      ? { valid: true, gatewayTxnId: result.refId || null, amountNpr: result.amount || null, raw: result.data || result }
      : { valid: false, error: result.error || 'Gateway could not confirm this payment.', raw: result };
  }

  const status = String(result.status || '').toLowerCase();
  if (status !== 'completed') {
    return { valid: false, error: `Khalti reports status "${result.status}".`, raw: result };
  }
  const paisa = Number(result.total_amount || result.totalAmount || 0);
  return {
    valid: true,
    gatewayTxnId: result.transaction_id || result.idx || null,
    amountNpr: paisa > 0 ? paisa / 100 : null,
    raw: result
  };
}

function list() {
  return configuredGateways();
}

module.exports = {
  GATEWAYS,
  name: 'payments',
  label: 'Payments',
  list,
  configuredGateways,
  isConfigured,
  isSupported,
  firstConfigured,
  initiate,
  verify
};
