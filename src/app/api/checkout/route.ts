import { NextRequest, NextResponse } from "next/server";
import { normalizeIdentity, identityErrorMessages } from "@/lib/identity";
import { applyPaidListing, getListingByUrl, MOCK_MODE } from "@/lib/store";
import { MIN_BID, MAX_BID, TOP1_STEP } from "@/lib/i18n";
import { Polar } from "@polar-sh/sdk";

export const dynamic = "force-dynamic";

/** Best-effort og:description fetch so new listings get a description
 *  automatically (same UX as the original). */
async function fetchDescription(href: string): Promise<string | null> {
  if (href.startsWith("https://x.com/")) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(href, {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; outbidarabs/1.0)" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 300_000);
    const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{4,300})["']/i);
    if (og) return og[1];
    const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{4,300})["']/i);
    if (desc) return desc[1];
    return null;
  } catch {
    return null;
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

  const existing = await getListingByUrl(identity.url);
  if (existing && amount <= existing.bid_amount) {
    const msg =
      lang === "ar"
        ? `هذه القائمة بسعر ${"$" + existing.bid_amount.toLocaleString("en-US")} بالفعل — ارفع سعرك بدولار واحد على الأقل`
        : `This listing is already at $${existing.bid_amount.toLocaleString("en-US")} — raise your bid by at least $1`;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // ── Mock checkout (dev): apply immediately and land on success ──
  if (MOCK_MODE) {
    const description = existing?.description ?? (await fetchDescription(identity.href));
    const result = await applyPaidListing({
      url: identity.url,
      displayName: existing?.display_name ?? identity.display_name,
      description,
      amount,
      orderId: `mock_${Date.now()}`,
    });
    if (!result.ok) {
      return NextResponse.json({ error: identityErrorMessages("too-low", lang as "ar" | "en") }, { status: 400 });
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

  const description = existing?.description ?? (await fetchDescription(identity.href));

  try {
    const polar = new Polar({
      accessToken: token,
      server: process.env.POLAR_ENVIRONMENT === "production" ? "production" : "sandbox",
    });
    const checkout = await polar.checkouts.create({
      products: [productId],
      amount: amount * 100, // cents, custom-price product
      successUrl: `${siteUrl}/success?checkout_id={CHECKOUT_ID}`,
      metadata: {
        identity_url: identity.url,
        display_name: existing?.display_name ?? identity.display_name,
        description: (description ?? "").slice(0, 480),
        amount: String(amount),
      },
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error("polar checkout error", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
  }
}
