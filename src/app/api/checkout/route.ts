import { NextRequest, NextResponse } from "next/server";
import { normalizeIdentity, identityErrorMessages } from "@/lib/identity";
import { applyPaidListing, getListingByUrl, getTopListing, MOCK_MODE } from "@/lib/store";
import { MIN_BID, MAX_BID } from "@/lib/i18n";
import { fetchListingMeta } from "@/lib/fetch-meta";
import { isPlatform } from "@/lib/platforms";
import { activePaymentProvider } from "@/lib/apply-payment";
import { Polar } from "@polar-sh/sdk";
import DodoPayments from "dodopayments";

export const dynamic = "force-dynamic";

const usd = (n: number) => "$" + n.toLocaleString("en-US");

// Layer-2 switch: real Supabase + mock payments. Explicit opt-in via
// ALLOW_MOCK_PAYMENTS=true (local only — Vercel production never sets it).
const MOCK_PAYMENTS = MOCK_MODE || process.env.ALLOW_MOCK_PAYMENTS === "true";

// ── Client-provided preview edits (from the preview card) ──
// Sanitized server-side; empty/oversized values are dropped and the
// server-side fetch (or the existing listing) is used instead.

function cleanTitle(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim().slice(0, 60);
  return s || undefined;
}

function cleanDescription(v: unknown): string | null | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim().slice(0, 150);
  return s || null;
}

function cleanImage(v: unknown): string | null | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, 480);
  if (!s) return null;
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") ? u.toString() : null;
  } catch {
    return undefined; // not a URL → ignore, fall back to fetch/existing
  }
}

export async function POST(req: NextRequest) {
  let body: {
    identity?: string;
    amount?: number;
    platform?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
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

  const [existing, top] = await Promise.all([getListingByUrl(identity.url), getTopListing()]);

  if (existing && amount <= existing.bid_amount) {
    const msg =
      lang === "ar"
        ? `هذه القائمة بسعر ${usd(existing.bid_amount)} بالفعل — ارفع سعرك بدولار واحد على الأقل`
        : `This listing is already at ${usd(existing.bid_amount)} — raise your bid by at least $1`;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Charge only the difference when raising an existing listing.
  const charge = existing ? amount - existing.bid_amount : amount;

  // Listing metadata: client edits (preview card) → existing values → server fetch.
  const clientTitle = cleanTitle(body.title);
  const clientDesc = cleanDescription(body.description);
  const clientImage = cleanImage(body.imageUrl);
  const needsFetch =
    (!clientTitle || clientDesc === undefined || clientImage === undefined) && !existing;
  const meta = needsFetch
    ? await fetchListingMeta(identity.platform, identity.url, identity.href)
    : { title: null, description: null, image: null };

  const displayName = clientTitle ?? existing?.display_name ?? identity.display_name;
  const description =
    clientDesc !== undefined ? clientDesc : (existing?.description ?? meta.description);
  const image = clientImage !== undefined ? clientImage : (existing?.image_url ?? meta.image);

  // ── Mock checkout: apply immediately and land on success ──
  if (MOCK_PAYMENTS) {
    const result = await applyPaidListing({
      url: identity.url,
      platform: identity.platform,
      displayName,
      description,
      imageUrl: image,
      targetUrl: identity.href,
      amount,
      orderId: `mock_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: identityErrorMessages(result.reason, lang as "ar" | "en") },
        { status: 400 }
      );
    }
    return NextResponse.json({
      url: `/success?name=${encodeURIComponent(result.listing.display_name)}&amount=${amount}&rank=${result.rank}&mock=1`,
    });
  }

  // ── Real checkout (Dodo or Polar — provider picked by env, dodo first) ──
  const provider = activePaymentProvider();
  if (!provider) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 500 });
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Polar rejects empty-string metadata values — only send non-empty keys.
  const metadata: Record<string, string> = {
    identity_url: identity.url,
    display_name: displayName,
    platform: identity.platform,
    target_url: identity.href.slice(0, 480),
    amount: String(amount), // intended new total bid
    base_bid: String(existing?.bid_amount ?? 0),
    charge: String(charge), // what the payer actually pays
  };
  // DataFast revenue attribution (https://datafa.st/docs/polar-checkout-api):
  // pass the SDK's first-party cookies as checkout metadata.
  const dfVisitor = req.cookies.get("datafast_visitor_id")?.value;
  const dfSession = req.cookies.get("datafast_session_id")?.value;
  if (dfVisitor) metadata.datafast_visitor_id = dfVisitor;
  if (dfSession) metadata.datafast_session_id = dfSession;
  if (description) metadata.description = description.slice(0, 480);
  if (image) metadata.image_url = image.slice(0, 480);

  try {
    if (provider === "dodo") {
      // ── Dodo Payments ──
      // Product must be Pay-What-You-Want with a $1 minimum so the per-checkout
      // `amount` (the bid, or the raise difference) is honored. Amount is in
      // cents, like Polar.
      const dodo = new DodoPayments({
        bearerToken: process.env.DODO_API_KEY!,
        environment: process.env.DODO_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode",
      });
      const session = await dodo.checkoutSessions.create({
        product_cart: [
          {
            product_id: process.env.DODO_PRODUCT_ID!,
            quantity: 1,
            // cents — the difference for raises, full bid for new listings
            amount: charge * 100,
          },
        ],
        return_url: `${siteUrl}/success?name=${encodeURIComponent(displayName)}&amount=${amount}`,
        metadata,
      });
      return NextResponse.json({ url: session.checkout_url });
    }

    // ── Polar ──
    const polar = new Polar({
      accessToken: process.env.POLAR_ACCESS_TOKEN!,
      server: process.env.POLAR_ENVIRONMENT === "production" ? "production" : "sandbox",
    });
    const checkout = await polar.checkouts.create({
      products: [process.env.POLAR_PRODUCT_ID!],
      amount: charge * 100, // cents — the difference for raises, full bid for new listings
      successUrl: `${siteUrl}/success?checkout_id={CHECKOUT_ID}`,
      metadata,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error(`${provider} checkout error`, e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
  }
}
