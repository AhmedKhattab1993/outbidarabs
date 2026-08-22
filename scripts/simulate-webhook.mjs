// Simulates a paid Polar checkout webhook, signed exactly like Polar signs it.
// Tests: signature verification, apply logic, DB writes, idempotency.
// Usage: node scripts/simulate-webhook.mjs [amount] [identityUrl]
import crypto from "node:crypto";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const secret = process.env.POLAR_WEBHOOK_SECRET;
if (!secret) {
  console.error("POLAR_WEBHOOK_SECRET not set");
  process.exit(1);
}
// NOTE: @polar-sh/sdk's validateEvent() derives the HMAC key from the raw
// secret STRING (utf-8 bytes of "whsec_..."), not the base64-decoded payload.
// We sign the same way so the endpoint accepts both ours and Polar's.

const amount = parseInt(process.argv[2] || "20", 10);
const identityUrl = process.argv[3] || "https://polar-e2e-test2.org";
const checkoutId = process.argv[4] || `polar_c_sim_${Date.now()}`;

// Prefer a real sandbox checkout object (exact Polar shape) when reachable;
// fall back to a minimal synthetic object.
let data;
try {
  const api = process.env.POLAR_ENVIRONMENT === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh";
  // checkoutId may be a `polar_c_...` client secret — resolve to the object via list+match
  let checkout = null;
  if (/^polar_c_/.test(checkoutId)) {
    const res = await fetch(`${api}/v1/checkouts/?limit=100`, {
      headers: { Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}` },
    });
    if (res.ok) {
      const list = await res.json();
      checkout = (list.items ?? []).find((c) => c.client_secret === checkoutId) ?? null;
    }
  } else {
    const res = await fetch(`${api}/v1/checkouts/${checkoutId}`, {
      headers: { Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}` },
    });
    if (res.ok) checkout = await res.json();
  }
  if (checkout) {
    data = checkout;
    data.status = "succeeded";
    // Newer SDK schema fields the sandbox REST response may omit:
    data.discount = data.discount ?? null;
    data.subscription_id = data.subscription_id ?? null;
    data.attached_custom_fields = data.attached_custom_fields ?? [];
    data.customer_metadata = data.customer_metadata ?? {};
    data.metadata = { ...data.metadata, ...{
      identity_url: identityUrl,
      amount: String(amount),
      base_bid: String(data.metadata?.base_bid ?? 0),
      charge: String(data.metadata?.charge ?? amount),
    }};
  }
} catch { /* fall through */ }
if (!data) {
  data = {
    id: checkoutId,
    status: "succeeded",
    amount: amount * 100,
    currency: "usd",
    metadata: {
      identity_url: identityUrl,
      display_name: identityUrl.replace(/^https?:\/\//, ""),
      amount: String(amount),
      base_bid: "0",
      charge: String(amount),
    },
  };
}

const payload = {
  type: "checkout.updated",
  timestamp: new Date().toISOString(),
  data,
};

const body = JSON.stringify(payload);
const webhookId = "msg_" + crypto.randomBytes(16).toString("hex");
const timestamp = Math.floor(Date.now() / 1000).toString();
const key = Buffer.from(secret, "utf-8");
const signature =
  "v1," + crypto.createHmac("sha256", key).update(`${webhookId}.${timestamp}.${body}`).digest("base64");

const headers = {
  "content-type": "application/json",
  "webhook-id": webhookId,
  "webhook-timestamp": timestamp,
  "webhook-signature": signature,
};

console.log(`POST ${BASE}/api/webhooks/polar`);
console.log(`  checkout: ${checkoutId} | amount: $${amount} | identity: ${identityUrl}`);

// 1. valid signature
let res = await fetch(`${BASE}/api/webhooks/polar`, { method: "POST", headers, body });
console.log(`→ valid signature:   ${res.status}`, await res.text());

// 2. replay (same id) — must be idempotent
res = await fetch(`${BASE}/api/webhooks/polar`, { method: "POST", headers, body });
console.log(`→ replay same event: ${res.status}`, await res.text());

// 3. tampered body — must be rejected 403
res = await fetch(`${BASE}/api/webhooks/polar`, {
  method: "POST",
  headers,
  body: body.replace('"succeeded"', '"expired"'),
});
console.log(`→ tampered payload:  ${res.status} (expect 403)`, await res.text());

// 4. garbage signature — must be rejected 403
res = await fetch(`${BASE}/api/webhooks/polar`, {
  method: "POST",
  headers: { ...headers, "webhook-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
  body,
});
console.log(`→ bad signature:     ${res.status} (expect 403)`, await res.text());
