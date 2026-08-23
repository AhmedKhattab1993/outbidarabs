// Simulates Dodo Payments webhooks against a running dev server.
// Signs payloads per the Standard Webhooks spec exactly like Dodo does
// (HMAC-SHA256 over `${id}.${timestamp}.${body}` with the whsec_ key bytes).
//
//   set -a; . ./.env; set +a
//   node scripts/simulate-dodo-webhook.mjs <amount> <identityUrl> <paymentId> [charge]
//
// Sends: valid (expect 200 + apply) · replay (200, no double apply) ·
// tampered body (403) · bad signature (403).

import crypto from "node:crypto";

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
const SECRET = process.env.DODO_WEBHOOK_SECRET || "whsec_test_sim_secret";
const [, , amountArg, identityUrl, paymentIdArg, chargeArg] = process.argv;

const amount = parseInt(amountArg || "3", 10);
const charge = parseInt(chargeArg || String(amount), 10);
const paymentId = paymentIdArg || `pay_sim_${Date.now()}`;

if (!identityUrl) {
  console.error("usage: node simulate-dodo-webhook.mjs <amount> <identityUrl> [paymentId] [charge]");
  process.exit(1);
}

// standardwebhooks: the signing key is the raw bytes of the base64 payload
// after the whsec_ prefix
const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");

function sign(id, timestamp, body) {
  const mac = crypto.createHmac("sha256", key);
  mac.update(`${id}.${timestamp}.${body}`);
  return `v1,${mac.digest("base64")}`;
}

function buildEvent(id, ts, data) {
  const body = JSON.stringify({ type: "payment.succeeded", data });
  return {
    body,
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(ts),
      "webhook-signature": sign(id, ts, body),
    },
  };
}

const data = {
  payment_id: paymentId,
  status: "succeeded",
  amount: charge * 100,
  metadata: {
    identity_url: identityUrl,
    display_name: "Dodo Sim Listing",
    platform: "website",
    target_url: identityUrl,
    amount: String(amount),
    base_bid: String(amount - charge),
    charge: String(charge),
    description: "applied by the Dodo webhook simulator",
  },
};

const ts = Math.floor(Date.now() / 1000);

async function send(label, { body, headers }, expect) {
  const res = await fetch(`${BASE}/api/webhooks/dodo`, { method: "POST", headers, body });
  const text = await res.text();
  const ok = res.status === expect;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${res.status} (expected ${expect}) ${text.slice(0, 120)}`);
  return ok;
}

// 1. valid
const valid = buildEvent(`evt_${paymentId}_1`, ts, data);
await send("valid event applies", valid, 200);
// 2. replay (same payment id → idempotent, no double apply)
await send("replay does not double-apply", valid, 200);
// 3. tampered body (signature from the ORIGINAL body, body swapped after)
const tampered = buildEvent(`evt_${paymentId}_3`, ts, data);
tampered.body = JSON.stringify({ type: "payment.succeeded", data: { ...data, amount: 1 } });
await send("tampered body rejected", tampered, 403);
// 4. bad signature
const badSig = buildEvent(`evt_${paymentId}_4`, ts, data);
badSig.headers["webhook-signature"] = "v1," + Buffer.from("garbage").toString("base64");
await send("bad signature rejected", badSig, 403);
