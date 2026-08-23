// Verifies a webhook secret WITHOUT applying anything: sends a correctly
// signed event whose type isn't payment.succeeded. A 200 proves the HMAC
// secret matches; a 403 means it doesn't. No board write happens either way.
import crypto from "node:crypto";

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
const SECRET = process.env.DODO_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("need DODO_WEBHOOK_SECRET");
  process.exit(1);
}
const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
const id = `evt_verify_${Date.now()}`;
const ts = Math.floor(Date.now() / 1000);
const body = JSON.stringify({ type: "ping", data: {} });
const mac = crypto.createHmac("sha256", key);
mac.update(`${id}.${ts}.${body}`);

const res = await fetch(`${BASE}/api/webhooks/dodo`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(ts),
    "webhook-signature": `v1,${mac.digest("base64")}`,
  },
  body,
});
const text = await res.text();
// 200 = signature verified (event ignored) · 403 = wrong secret
console.log(res.status === 200 ? "✓" : "✗", `secret check: ${res.status} ${text.slice(0, 80)}`);
process.exit(res.status === 200 ? 0 : 1);
