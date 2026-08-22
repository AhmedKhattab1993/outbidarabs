import { NextRequest, NextResponse } from "next/server";
import { normalizeIdentity, identityErrorMessages } from "@/lib/identity";
import { applyPaidListing, getListingByUrl, getTopListing, MOCK_MODE } from "@/lib/store";
import { MIN_BID, MAX_BID, TOP1_STEP } from "@/lib/i18n";
import { Polar } from "@polar-sh/sdk";

export const dynamic = "force-dynamic";

const usd = (n: number) => "$" + n.toLocaleString("en-US");

// Layer-2 switch: real Supabase + mock payments. Lets the full rules engine
// write to the real database without Polar configured. Explicit opt-in via
// ALLOW_MOCK_PAYMENTS=true (local only — Vercel production never sets it);
// takes precedence over Polar keys so an expired token can't break local dev.
const MOCK_PAYMENTS = MOCK_MODE || process.env.ALLOW_MOCK_PAYMENTS === "true";

/** Best-effort metadata fetch so new listings get a description + logo
 *  automatically (same UX as the original). */
async function fetchMeta(href: string): Promise<{ description: string | null; image: string | null }> {
  if (href.startsWith("https://x.com/") || href.startsWith("https://twitter.com/")) {
    return { description: null, image: null };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(href, {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; outbidarabs/1.0)" },
    });
    clearTimeout(timer);
    if (!res.ok) return { description: null, image: null };
    const html = (await res.text()).slice(0, 300_000);

    const meta = (prop: string) => {
      const m = html.match(
        new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']{4,600})["']`, "i")
      );
      return m ? m[1] : null;
    };

    let image = meta("og:image") ?? meta("twitter:image");
    if (image) {
      try {
        image = new URL(image, href).toString(); // resolve relative URLs
      } catch {
        image = null;
      }
    }
    return {
      description: meta("og:description") ?? meta("description"),
      image,
    };
  } catch {
    return { description: null, image: null };
  }
}

export async function POST(req: NextRequest) {
  let body: { identity?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const lang = req.cookies.get("lang")?.value === "en" ? "en" : "ar";
  const identity = normalizeIdentity(body.identity ?? "");
  if (!identity.ok) {
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

  // Taking #1 from someone else costs at least top bid + $5. The current #1
  // may extend its own lead by any amount (≥ $1). (Mirrors outbid.lol.)
  const isTop1 = existing != null && top != null && existing.id === top.id;
  if (!isTop1 && top && amount > top.bid_amount && amount < top.bid_amount + TOP1_STEP) {
    const need = top.bid_amount + TOP1_STEP;
    const msg =
      lang === "ar"
        ? `لتأخذ المركز الأول، زايد بما لا يقل عن ${usd(need)}.`
        : `To take #1, bid at least ${usd(need)}.`;
    return NextResponse.json({ error: msg, need }, { status: 400 });
  }

  // Charge only the difference when raising an existing listing.
  const charge = existing ? amount - existing.bid_amount : amount;

  // ── Mock checkout: apply immediately and land on success ──
  // (full mock mode, or layer-2 local stack with real DB + mock payments)
  if (MOCK_PAYMENTS) {
    const meta = await fetchMeta(identity.href);
    const description = existing?.description ?? meta.description;
    const result = await applyPaidListing({
      url: identity.url,
      displayName: existing?.display_name ?? identity.display_name,
      description,
      imageUrl: existing?.image_url ?? meta.image,
      targetUrl: identity.href,
      amount,
      orderId: `mock_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    });
    if (!result.ok) {
      const reason = result.reason === "top1-window" && result.need
        ? lang === "ar"
          ? `لتأخذ المركز الأول، زايد بما لا يقل عن ${usd(result.need)}.`
          : `To take #1, bid at least ${usd(result.need)}.`
        : identityErrorMessages(result.reason, lang as "ar" | "en");
      return NextResponse.json({ error: reason }, { status: 400 });
    }
    return NextResponse.json({
      url: `/success?name=${encodeURIComponent(result.listing.display_name)}&amount=${amount}&rank=${result.rank}&mock=1`,
    });
  }

  // ── Real Polar checkout ──
  const token = process.env.POLAR_ACCESS_TOKEN;
  const productId = process.env.POLAR_PRODUCT_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (!token || !productId) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 500 });
  }

  const meta = await fetchMeta(identity.href);
  const description = existing?.description ?? meta.description;
  const image = existing?.image_url ?? meta.image;

  try {
    const polar = new Polar({
      accessToken: token,
      server: process.env.POLAR_ENVIRONMENT === "production" ? "production" : "sandbox",
    });
    // Polar rejects empty-string metadata values — only send non-empty keys.
    const metadata: Record<string, string> = {
      identity_url: identity.url,
      display_name: existing?.display_name ?? identity.display_name,
      target_url: identity.href.slice(0, 480),
      amount: String(amount), // intended new total bid
      base_bid: String(existing?.bid_amount ?? 0),
      charge: String(charge), // what the payer actually pays
    };
    // DataFast revenue attribution (https://datafa.st/docs/polar-checkout-api):
    // pass the SDK's first-party cookies as checkout metadata; DataFast
    // attributes the payment automatically — no webhook needed.
    const dfVisitor = req.cookies.get("datafast_visitor_id")?.value;
    const dfSession = req.cookies.get("datafast_session_id")?.value;
    if (dfVisitor) metadata.datafast_visitor_id = dfVisitor;
    if (dfSession) metadata.datafast_session_id = dfSession;
    if (description) metadata.description = description.slice(0, 480);
    if (image) metadata.image_url = image.slice(0, 480);
    const checkout = await polar.checkouts.create({
      products: [productId],
      amount: charge * 100, // cents — the difference for raises, full bid for new listings
      successUrl: `${siteUrl}/success?checkout_id={CHECKOUT_ID}`,
      metadata,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error("polar checkout error", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
  }
}
