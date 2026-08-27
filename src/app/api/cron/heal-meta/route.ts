// Daily meta-heal cron (Vercel Cron → see vercel.json).
//
// Board cards whose profile image never loaded (e.g. an Instagram enrichment
// that failed on pay day) get a fresh attempt — at most once a day, most
// visible cards first. Everything the job finds is persisted both to the
// listing row itself and the Supabase meta_cache table, so future previews
// of that profile serve instantly.
//
// Instagram goes through the enrichment job (claim → proxied fetch → avatar
// → Storage → finish); other platforms use the synchronous fetchers with a
// per-listing budget. force=true re-claims rows even inside a backoff window
// (the daily cadence is gentle enough to never hammer the proxy).
//
// Auth: Vercel automatically sends `Authorization: Bearer $CRON_SECRET` for
// scheduled invocations when CRON_SECRET is set on the project. Unset locally
// ⇒ open, which only ever runs read-modify loops over mock data.
import { NextRequest, NextResponse } from "next/server";
import { getMetaCached, listingsMissingImage, updateListingMeta, MOCK_MODE } from "@/lib/store";
import { fetchListingMeta } from "@/lib/fetch-meta";
import { claimInstagramEnrichment, runInstagramEnrichment } from "@/lib/meta-enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Wall-clock guards: stay well inside the 60s function ceiling even when
// every upstream hop hangs to its timeout.
const LOOP_DEADLINE_MS = 50_000;
const PER_LISTING_BUDGET_MS = 12_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const candidates = await listingsMissingImage(30);
  let checked = 0;
  let updated = 0;
  let skippedTime = 0;

  for (const l of candidates) {
    if (Date.now() - started > LOOP_DEADLINE_MS) {
      skippedTime = candidates.length - checked;
      break;
    }
    checked++;
    try {
      let meta: { title: string | null; description: string | null; image: string | null } | null = null;
      if (l.platform === "instagram" && !MOCK_MODE) {
        const claim = await claimInstagramEnrichment(l.url, l.platform, { force: true });
        if (claim.action === "run") {
          const r = await runInstagramEnrichment(l.url, l.platform, claim.attempts);
          if (r.ok) meta = r.meta ?? null;
        } else {
          // A live lease from a concurrent interactive job — read whatever
          // it has managed to persist so far.
          const row = await getMetaCached(l.url);
          meta = row && (row.title || row.description || row.image_url)
            ? { title: row.title, description: row.description, image: row.image_url }
            : null;
        }
      } else {
        meta = await fetchListingMeta(l.platform, l.url, l.target_url || l.url);
      }
      if (!meta || (!meta.title && !meta.description && !meta.image)) continue;

      // Fill blanks; never overwrite data already on the card.
      const patch: Record<string, string> = {};
      if (meta.image && !l.image_url) patch.image_url = meta.image.slice(0, 480);
      if (meta.description && !l.description) patch.description = meta.description;
      if (meta.title && (!l.display_name || /^@/.test(l.display_name))) {
        patch.display_name = meta.title;
      }
      if (Object.keys(patch).length > 0 && (await updateListingMeta(l.id, patch))) {
        updated++;
      }
    } catch {
      /* per-listing failures must not sink the batch */
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    checked,
    updated,
    skippedForTime: skippedTime,
    elapsedMs: Date.now() - started,
  });
}
