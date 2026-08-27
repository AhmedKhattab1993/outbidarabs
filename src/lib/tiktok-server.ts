// TikTok Events API (v1.3): server-side conversion events sent from the Dodo
// payment webhook. Complements the browser pixel so iOS/redirect losses don't
// hide revenue — both sides share an event_id and TikTok dedupes.
//
// Config: TIKTOK_EVENTS_API_TOKEN (Events Manager → Settings → Events API),
// NEXT_PUBLIC_TIKTOK_PIXEL_ID (same pixel as the browser side, it's public),
// optional TIKTOK_TEST_EVENT_CODE while verifying against the sandbox.

import { createHash } from "crypto";

const PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || "";
const TOKEN = process.env.TIKTOK_EVENTS_API_TOKEN || "";
const TEST_EVENT_CODE = process.env.TIKTOK_TEST_EVENT_CODE || "";
const ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

/** Visitor context captured at checkout creation, replayed to TikTok at
 *  apply time — matching works on this, not on the webhook's own request. */
export type TikTokUserContext = {
  ip?: string | null;
  userAgent?: string | null;
  /** _ttp cookie set by the browser pixel (strongest match signal). */
  ttp?: string | null;
};

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Leftmost client IP behind a proxy (Vercel sets x-forwarded-for). */
export function clientIpFrom(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim();
  return first || null;
}

/**
 * Send one server-side CompletePayment (fire-and-forget by design: a TikTok
 * hiccup must never fail payment application). No-op unless token + pixel are
 * configured and eventId exists — without a shared event_id the pixel event
 * would double-count instead of deduping.
 */
export async function sendTikTokCompletePayment(opts: {
  eventId?: string | null;
  /** What was actually paid, in whole dollars. */
  value: number;
  email?: string | null;
  context?: TikTokUserContext;
}): Promise<void> {
  if (!TOKEN || !PIXEL_ID || !opts.eventId) return;
  try {
    const user: Record<string, unknown> = {};
    if (opts.context?.ip) user.ip = opts.context.ip;
    if (opts.context?.userAgent) user.user_agent = opts.context.userAgent;
    if (opts.context?.ttp) user.ttp = opts.context.ttp;
    if (opts.email) user.email = sha256Hex(opts.email); // advanced matching

    const body: Record<string, unknown> = {
      event_source: "web",
      event_source_id: PIXEL_ID,
      data: [
        {
          event: "CompletePayment",
          event_time: Math.floor(Date.now() / 1000),
          event_id: opts.eventId,
          user,
          properties: {
            currency: "USD",
            value: Math.max(0, Math.round(opts.value)),
            contents: [{ content_id: "leaderboard_bid", content_name: "leaderboard_bid" }],
          },
        },
      ],
    };
    if (TEST_EVENT_CODE) body.test_event_code = TEST_EVENT_CODE;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "Access-Token": TOKEN },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000), // never hold the webhook hostage
    });
    // API returns {code:0} on success; anything else is logged, not thrown.
    const json = (await res.json()) as { code?: number; message?: string };
    if (json.code !== 0) console.warn("tiktok events api rejected event", opts.eventId, json.message);
  } catch (e) {
    console.warn("tiktok events api send failed", e instanceof Error ? e.message : e);
  }
}
