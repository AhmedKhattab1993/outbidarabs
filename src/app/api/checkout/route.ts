import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { normalizeIdentity, identityErrorMessages } from "@/lib/identity";
import { applyPaidListing, getListingByUrl, getTopListing, MOCK_MODE } from "@/lib/store";
import { getSessionUser } from "@/lib/accounts";
import { MIN_BID, MAX_BID } from "@/lib/i18n";
import { fetchListingMeta } from "@/lib/fetch-meta";
import { isPlatform } from "@/lib/platforms";
import { paymentsEnvTag } from "@/lib/payments-env";
import DodoPayments from "dodopayments";

export const dynamic = "force-dynamic";

const usd = (n: number) => "$" + n.toLocaleString("en-US");

// payment-status cookie binding: an httpOnly token cookie bound to this
// checkout. Only the browser that initiated the payment can later read the
// payer email (anyone holding the checkout/payment id just gets applied).
const PAY_COOKIE_MAX_AGE = 60 * 60; // 1 hour — covers webhook polling

function setPayCookie(res: NextResponse, checkoutId: string, token: string): void {
  // Cookie-name safety only — the VALUE is the secret and payment-status
  // matches by value across pay_* cookies, so the name is not load-bearing.
  const name = `pay_${checkoutId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60)}`;
  res.cookies.set(name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PAY_COOKIE_MAX_AGE,
  });
}

const newPayToken = () => randomBytes(16).toString("hex");

// Layer-2 switch: real Supabase + mock payments. Explicit opt-in via
// ALLOW_MOCK_PAYMENTS=true (local only — Vercel production never sets it).
const MOCK_PAYMENTS = MOCK_MODE || process.env.ALLOW_MOCK_PAYMENTS === "true";

export async function POST(req: NextRequest) {
  let body: {
    identity?: string;
    amount?: number;
    platform?: string;
    payerHint?: string; // mock payments only: browser payer key for demo attribution
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

  const [existing, top, auth] = await Promise.all([
    getListingByUrl(identity.url),
    getTopListing(),
    getSessionUser(),
  ]);

  if (existing && amount <= existing.bid_amount) {
    const msg =
      lang === "ar"
        ? `هذه القائمة بسعر ${usd(existing.bid_amount)} بالفعل — ارفع سعرك بدولار واحد على الأقل`
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
    // Mock payer key: logged-in email → browser hint → anonymous. Real Dodo
    // payments ignore the client hint entirely — the webhook takes the payer
    // email from the verified Dodo payload.
    const mockPayerEmail = auth?.email ?? (body.payerHint || null);
    const orderId = `mock_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const token = newPayToken();
    const result = await applyPaidListing({
      url: identity.url,
      platform: identity.platform,
      displayName,
      description,
      imageUrl: image,
      targetUrl: identity.href,
      amount,
      orderId,
      payerEmail: mockPayerEmail,
      userId: auth?.id ?? null,
      token,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: identityErrorMessages(result.reason, lang as "ar" | "en") },
        { status: 400 }
      );
    }
    const res = NextResponse.json({
      url: `/success?name=${encodeURIComponent(result.listing.display_name)}&amount=${amount}&rank=${result.rank}&mock=1`,
      checkoutId: orderId,
    });
    setPayCookie(res, orderId, token);
    return res;
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
  };
  if (description) metadata.description = description.slice(0, 480);
  if (image) metadata.image_url = image.slice(0, 480);
  // Cookie-binding token: the webhook apply records it (checkout_tokens) so
  // /api/payment-status reveals the payer email only to this browser.
  const payToken = newPayToken();
  metadata.checkout_token = payToken;
  // Logged-in payer: attribute the payment directly (email prefill too).
  if (auth) {
    metadata.user_id = auth.id;
    metadata.email = auth.email;
  }

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
      // Prefill the payer email for logged-in users (attribution backup).
      customer: auth ? { email: auth.email } : undefined,
      metadata,
    });
    const res = NextResponse.json({ url: session.checkout_url, checkoutId: session.session_id });
    setPayCookie(res, session.session_id, payToken);
    return res;
  } catch (e) {
    console.error("dodo checkout error", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
  }
}
