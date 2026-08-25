import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { applyPaidCheckout, payerEmailFromPayload, userIdFromMetadata } from "@/lib/apply-payment";
import { paymentsEnvTag } from "@/lib/payments-env";

export const dynamic = "force-dynamic";

// Dodo Payments webhook (Standard Webhooks spec: HMAC-SHA256 over
// `id.timestamp.body`, headers webhook-id / webhook-timestamp / webhook-signature).
// A succeeded payment creates or raises the listing; the apply layer is
// idempotent per payment id.
export async function POST(req: Request) {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  let event: { type: string; data: any };
  try {
    const body = await req.text();
    const wh = new Webhook(secret);
    event = wh.verify(body, {
      "webhook-id": req.headers.get("webhook-id") ?? "",
      "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": req.headers.get("webhook-signature") ?? "",
    }) as { type: string; data: any };
  } catch (e) {
    console.error("dodo webhook verification failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  if (event.type !== "payment.succeeded") {
    return NextResponse.json({ received: true });
  }

  const data = event.data ?? {};
  const metadata: Record<string, string> = data.metadata ?? {};
  const orderId = data.payment_id ?? data.id ?? `dodo_${Date.now()}`;

  // Dodo test mode fans every event out to all registered endpoints (staging,
  // production, local tunnels). Apply only the payments created by this
  // deployment's checkout; 200 so Dodo doesn't retry the other environments'
  // events here. Untagged = pre-guard checkout session → skip everywhere that
  // isn't local (test sessions expire; no live sessions predate the guard).
  const own = paymentsEnvTag();
  const tag = metadata.env;
  const allowed = tag === own || (tag === undefined && own === "local");
  if (!allowed) {
    console.log("webhook skipped (env mismatch)", { tag, own, orderId });
    return NextResponse.json({ received: true, ok: false, skipped: "env_mismatch" });
  }

  // Payer attribution: the verified Dodo payload wins; metadata.user_id
  // (set server-side at checkout for logged-in payers) backs it up.
  const payerEmail = payerEmailFromPayload(data);
  const userId = userIdFromMetadata(metadata);

  const result = await applyPaidCheckout(metadata, String(orderId), { payerEmail, userId });
  return NextResponse.json({ received: true, ok: result.ok });
}
