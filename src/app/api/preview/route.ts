import { createHash } from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { normalizeIdentity } from "@/lib/identity";
import { getListingByUrl, getTopListing, MOCK_MODE } from "@/lib/store";
import { fetchListingMeta } from "@/lib/fetch-meta";
import { cachedIgMeta, claimInstagramEnrichment, runInstagramEnrichment } from "@/lib/meta-enrich";
import { isPlatform } from "@/lib/platforms";

export const dynamic = "force-dynamic";
// The interactive response is DB-only (fast). The Instagram enrichment job
// rides along in after() with a 75s lease — 60s keeps it comfortably inside
// the function ceiling while never delaying the response itself.
export const maxDuration = 60;

// Preview: platform detection + metadata for the claim form.
//  - Non-Instagram: synchronous smart fetch (fast, works from datacenter
//    IPs), served through the memory + Supabase caches.
//  - Instagram (Pattern B): the response NEVER waits on Instagram. The row
//    in meta_cache is the truth — served if present; otherwise the lease is
//    claimed atomically, the enrichment job runs in after() (unblocking
//    proxy → avatar → Storage), and the client polls until fetch_status is
//    ok/failed. A failed fetch returns meta: null and the UI falls back to
//    the platform icon + handle.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const identity = normalizeIdentity(
    searchParams.get("identity") ?? "",
    isPlatform(searchParams.get("platform")) ? (searchParams.get("platform") as never) : undefined
  );
  const t0 = Date.now();
  let metaSource: "cache" | "live" | "miss" | "pending" | null = null;

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

  let meta: { title: string | null; description: string | null; image: string | null } | null = null;
  let fetchStatus: "ok" | "pending" | "failed" = "failed";

  if (identity.platform === "instagram") {
    // ── Pattern B: DB is truth; job fills the row in the background ──
    const served = await cachedIgMeta(identity.url);
    meta = served.meta;
    fetchStatus = served.fetchStatus;
    // Claim (atomic, fast). A won claim runs the job after the response —
    // filling a missing row, or silently refreshing a stale one.
    const claim = MOCK_MODE
      ? ({ action: "serve", status: "failed" } as const)
      : await claimInstagramEnrichment(identity.url, identity.platform);
    if (claim.action === "run") {
      const attempts = claim.attempts;
      after(async () => {
        await runInstagramEnrichment(identity.url, identity.platform, attempts);
      });
      if (!meta) fetchStatus = "pending";
    } else if (!meta) {
      fetchStatus = claim.status ?? "failed";
    }
    metaSource = meta ? "cache" : claim.action === "run" ? "pending" : "miss";
  } else {
    // ── Synchronous path (platforms that serve datacenter IPs) ──
    const m = await fetchListingMeta(identity.platform, identity.url, identity.href);
    meta = m.title || m.description || m.image ? m : null;
    fetchStatus = meta ? "ok" : "failed";
    metaSource =
      meta
        ? Date.now() - t0 > 2500 // anything this slow can only be live upstreams
          ? "live"
          : "cache"
        : "miss";
  }

  // One line per request — makes cache hits / job handoffs legible in
  // Vercel runtime logs without any log-drain setup.
  console.log(
    `[preview] ${identity.platform} ${identity.url} → ${metaSource} ${fetchStatus} ${Date.now() - t0}ms`
  );
  // Environment fingerprint (hashed — no secrets in logs) to diagnose
  // wiring drift between environments. Stable within a scope/deploy.
  console.log(
    `[preview] env supabase=${createHash("sha256").update(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "unset").digest("hex").slice(0, 10)} mock=${process.env.NEXT_PUBLIC_MOCK_MODE ?? "unset"} igproxy=${process.env.IG_PROXY_URL ? "set" : "unset"}`
  );

  return NextResponse.json({
    status: "ok",
    platform: identity.platform,
    url: identity.url,
    href: identity.href,
    displayName: identity.display_name,
    meta,
    fetchStatus, // client polls /api/preview while this is "pending"
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
