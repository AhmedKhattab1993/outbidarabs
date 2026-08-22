import { NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { applyPaidListing, getListingByUrl } from "@/lib/store";

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
  // applyPaidListing is idempotent per checkout id.
  const isCheckoutPaid =
    (event.type === "checkout.updated" || event.type === "checkout.created") &&
    (event.data as any)?.status in { confirmed: 1, succeeded: 1 };

  if (!isCheckoutPaid) {
    return NextResponse.json({ received: true });
  }

  const payload = event.data as any;
  const metadata = payload?.metadata ?? {};
  const identityUrl = metadata.identity_url;
  const amount = parseInt(String(metadata.amount ?? "0"), 10);
  const baseBid = parseInt(String(metadata.base_bid ?? "0"), 10) || 0;
  const charge = parseInt(String(metadata.charge ?? "0"), 10) || amount;
  if (!identityUrl || !amount) {
    console.error("polar webhook missing metadata", payload?.id);
    return NextResponse.json({ received: true });
  }

  // Race safety: the board may have moved since checkout was created. The
  // payer paid `charge` to raise the listing by that much — make sure their
  // payment always buys exactly that raise, whatever the current bid is.
  const current = await getListingByUrl(identityUrl);
  let effectiveAmount = amount;
  if (current && amount <= current.bid_amount) {
    effectiveAmount = current.bid_amount + charge;
  }

  const result = await applyPaidListing({
    url: identityUrl,
    platform: (metadata.platform as any) ?? undefined,
    displayName: metadata.display_name ?? identityUrl,
    description: metadata.description || null,
    imageUrl: metadata.image_url || null,
    targetUrl: metadata.target_url || null,
    amount: effectiveAmount,
    orderId: payload?.id ?? `polar_${Date.now()}`,
  });

  if (!result.ok) {
    console.error("polar webhook apply failed", result.reason);
  }
  return NextResponse.json({ received: true, ok: result.ok });
}
