import { NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { applyPaidCheckout } from "@/lib/apply-payment";

export const dynamic = "force-dynamic";

// Polar webhook: a succeeded/confirmed checkout creates or raises the listing.
export async function POST(req: Request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  let event;
  try {
    const body = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    event = await validateEvent(body, headers, secret);
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
    }
    throw e;
  }

  // A paid checkout arrives as `checkout.updated` with status "confirmed"
  // (authorized) or "succeeded" (captured). Both are money in the bank —
  // the apply layer is idempotent per checkout id.
  const isCheckoutPaid =
    (event.type === "checkout.updated" || event.type === "checkout.created") &&
    (event.data as any)?.status in { confirmed: 1, succeeded: 1 };

  if (!isCheckoutPaid) {
    return NextResponse.json({ received: true });
  }

  const payload = event.data as any;
  const result = await applyPaidCheckout(payload?.metadata ?? {}, payload?.id ?? `polar_${Date.now()}`);
  return NextResponse.json({ received: true, ok: result.ok });
}
