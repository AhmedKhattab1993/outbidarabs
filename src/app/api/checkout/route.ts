import { NextRequest, NextResponse } from "next/server";
import { normalizeIdentity, identityErrorMessages } from "@/lib/identity";
import { applyPaidListing, getListingByUrl, MOCK_MODE } from "@/lib/store";
import { getSessionUser } from "@/lib/accounts";
import { MIN_BID, MAX_BID } from "@/lib/i18n";
import { fetchListingMeta } from "@/lib/fetch-meta";
import { isPlatform } from "@/lib/platforms";
import { paymentsEnvTag } from "@/lib/payments-env";
import DodoPayments from "dodopayments";

export const dynamic = "force-dynamic";

const usd = (n: number) => "$" + n.toLocaleString("en-US");

// Layer-2 switch: real Supabase + mock payments. Explicit opt-in via
// ALLOW_MOCK_PAYMENTS=true (local only — Vercel production never sets it).
const MOCK_PAYMENTS = MOCK_MODE || process.env.ALLOW_MOCK_PAYMENTS === "true";

export async function POST(req: NextRequest) {
  // Paying requires a session (the inline email-code gate in the claim form
  // creates one just before this call). Enforced BEFORE any validation,
  // metadata fetching or provider work — anonymous callers never reach Dodo.
  const auth = await getSessionUser();
  if (!auth) {
    return NextResponse.json({ error: "login_required" }, { status: 401 });
  }

  let body: {
    identity?: string;
    amount?: number;
    platform?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const lang = req.cookies.get("lang")?.value === "en" ? "en" : "ar";
  const platformHint = isPlatform(body.platform) ? body.platform : undefined;
  const identity = normalizeIdentity(body.identity ?? "", platformHint);
  if (!identity.ok) {
    if (identity.reason === "ambiguous") {
      return NextResponse.json(
        { error: identityErrorMessages("ambiguous", lang as "ar" | "en"), ambiguous: true },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: identityErrorMessages(identity.reason, lang as "ar" | "en") }, { status: 400 });
  }

  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: identityErrorMessages("invalid", lang as "ar" | "en") }, { status: 400 });
  }
  if (amount < MIN_BID || amount > MAX_BID) {
    return NextResponse.json(
      { error: `${identityErrorMessages("invalid", lang as "ar" | "en")} ($${MIN_BID}–$${MAX_BID})` },
      { status: 400 }
    );
  }

  const existing = await getListingByUrl(identity.url);

  if (existing && amount <= existing.bid_amount) {
    const msg =
      lang === "ar"
        ? `هذه القائمة موجودة بالفعل عند ${usd(existing.bid_amount)} — زايد بمبلغ أعلى بفارق دولار واحد على الأقل`
        : `This listing is already at ${usd(existing.bid_amount)} — raise your bid by at least $1`;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Charge only the difference when raising an existing listing.
  const charge = existing ? amount - existing.bid_amount : amount;

  // Listing metadata: existing values → server-side fetch (cached, already
  // sanitized to display/bio limits in fetch-meta) → raw handle. The preview
  // card is view-only ground truth, so nothing comes from the client.
  const meta = existing
    ? { title: null, description: null, image: null }
    : await fetchListingMeta(identity.platform, identity.url, identity.href);

  const displayName = existing?.display_name ?? meta.title ?? identity.display_name;
  const description = existing?.description ?? meta.description ?? null;
  const image = existing?.image_url ?? meta.image ?? null;

  // ── Mock checkout: apply immediately and land on success ──
  if (MOCK_PAYMENTS) {
    const orderId = `mock_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const result = await applyPaidListing({
      url: identity.url,
      platform: identity.platform,
      displayName,
      description,
      imageUrl: image,
      targetUrl: identity.href,
      amount,
      orderId,
      payerEmail: auth.email,
      userId: auth.id,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: identityErrorMessages(result.reason, lang as "ar" | "en") },
        { status: 400 }
      );
    }
    return NextResponse.json({
      url: `/success?name=${encodeURIComponent(result.listing.display_name)}&amount=${amount}&rank=${result.rank}&mock=1`,
      checkoutId: orderId,
    });
  }

  // ── Dodo Payments checkout ──
  if (!process.env.DODO_API_KEY || !process.env.DODO_PRODUCT_ID) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 500 });
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Metadata is read back by the webhook to apply the listing. Empty values omitted.
  const metadata: Record<string, string> = {
    env: paymentsEnvTag(), // webhook applies only payments from this environment
    identity_url: identity.url,
    display_name: displayName.slice(0, 480),
    platform: identity.platform,
    target_url: identity.href.slice(0, 480),
    amount: String(amount), // intended new total bid
    base_bid: String(existing?.bid_amount ?? 0),
    charge: String(charge), // what the payer actually pays
    // The payer is always logged in at this point — attribute directly.
    user_id: auth.id,
    email: auth.email,
  };
  if (description) metadata.description = description.slice(0, 480);
  if (image) metadata.image_url = image.slice(0, 480);

  try {
    // Product is Pay-What-You-Want with a $1 minimum so the per-checkout
    // `amount` (the bid, or the raise difference) is honored. Amount is in cents.
    const dodo = new DodoPayments({
      bearerToken: process.env.DODO_API_KEY,
      environment: process.env.DODO_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode",
    });
    const session = await dodo.checkoutSessions.create({
      product_cart: [
        {
          product_id: process.env.DODO_PRODUCT_ID,
          quantity: 1,
          amount: charge * 100, // cents — the difference for raises, full bid for new listings
        },
      ],
      return_url: `${siteUrl}/success?name=${encodeURIComponent(displayName)}&amount=${amount}`,
      // Prefill the (verified) payer email — Dodo asks only for the card.
      customer: { email: auth.email },
      metadata,
    });
    return NextResponse.json({ url: session.checkout_url, checkoutId: session.session_id });
  } catch (e) {
    console.error("dodo checkout error", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
  }
}
