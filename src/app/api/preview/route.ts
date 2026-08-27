import { NextRequest, NextResponse, after } from "next/server";
import { normalizeIdentity } from "@/lib/identity";
import { getListingByUrl, getTopListing } from "@/lib/store";
import { fetchListingMeta } from "@/lib/fetch-meta";
import { isPlatform } from "@/lib/platforms";

export const dynamic = "force-dynamic";
// Hard ceiling in fetch-meta is ~9s; declare 15s so serverless limits never
// truncate a legitimately slow (worst-case) lookup.
export const maxDuration = 15;

// Preview: platform detection + smart fetch + existing-listing context for
// the claim form. Never fails hard — a failed fetch returns meta: null and
// the UI falls back to the platform icon + handle.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const identity = normalizeIdentity(
    searchParams.get("identity") ?? "",
    isPlatform(searchParams.get("platform")) ? (searchParams.get("platform") as never) : undefined
  );

  if (!identity.ok) {
    if (identity.reason === "ambiguous") {
      return NextResponse.json({ status: "ambiguous", candidates: identity.candidates ?? [] });
    }
    return NextResponse.json({ status: "error", reason: identity.reason });
  }

  const [existing, top] = await Promise.all([
    getListingByUrl(identity.url),
    getTopListing(),
  ]);

  // Smart fetch (best effort, cached server-side). Never blocks long.
  const meta = await fetchListingMeta(identity.platform, identity.url, identity.href);

  // Instagram often can't be fetched within an interactive window (per-IP
  // lockouts, archive.org congestion). When that happens, retry ONCE in the
  // background with a deep budget: the result persists into the Supabase
  // meta_cache table, so the next paste of this profile — or its checkout —
  // serves full data instantly even though this response shows just the
  // handle. `after()` keeps work alive past the response on Vercel.
  if (!(meta.title || meta.description || meta.image) && identity.platform === "instagram") {
    after(async () => {
      try {
        await fetchListingMeta(identity.platform, identity.url, identity.href, {
          budgetMs: 30_000,
          force: true,
        });
      } catch {
        /* best-effort heal — nothing depends on it */
      }
    });
  }

  return NextResponse.json({
    status: "ok",
    platform: identity.platform,
    url: identity.url,
    href: identity.href,
    displayName: identity.display_name,
    meta: meta.title || meta.description || meta.image ? meta : null,
    existing: existing
      ? {
          url: existing.url,
          display_name: existing.display_name,
          bid_amount: existing.bid_amount,
          platform: existing.platform,
        }
      : null,
    topBid: top?.bid_amount ?? 0,
    topUrl: top?.url ?? null,
  });
}
