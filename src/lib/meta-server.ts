// Meta Conversions API: server-side Purchase events sent from the Dodo
// payment webhook. Complements the browser pixel so iOS/redirect losses
// don't hide revenue — both sides share an event_id and Meta dedupes.
//
// Config: META_CONVERSIONS_API_TOKEN (Events Manager → Settings → Conversions
// API → Generate access token), NEXT_PUBLIC_META_PIXEL_ID (same pixel as the
// browser side, it's public), optional META_TEST_EVENT_CODE while verifying
// against the sandbox.

// Shared hashing/IP helpers live in tiktok-server.ts (same primitives).
import { sha256Hex } from "./tiktok-server";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";
const TOKEN = process.env.META_CONVERSIONS_API_TOKEN || "";
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || "";
const ENDPOINT = "https://graph.facebook.com/v21.0";

/** Visitor context captured at checkout creation, replayed to Meta at
 *  apply time — matching works on this, not on the webhook's own request. */
export type MetaUserContext = {
  ip?: string | null;
  userAgent?: string | null;
  /** _fbp cookie set by the browser pixel (strongest match signal). */
  fbp?: string | null;
};

/**
 * Send one server-side Purchase (fire-and-forget by design: a Meta hiccup
 * must never fail payment application). No-op unless token + pixel are
 * configured and eventId exists — without a shared event_id the pixel event
 * would double-count instead of deduping.
 */
export async function sendMetaPurchase(opts: {
  eventId?: string | null;
  /** What was actually paid, in whole dollars. */
  value: number;
  email?: string | null;
  context?: MetaUserContext;
}): Promise<void> {
  if (!TOKEN || !PIXEL_ID || !opts.eventId) return;
  try {
    const userData: Record<string, unknown> = {};
    if (opts.email) userData.em = [sha256Hex(opts.email.trim().toLowerCase())];
    if (opts.context?.ip) userData.client_ip_address = opts.context.ip;
    if (opts.context?.userAgent) userData.client_user_agent = opts.context.userAgent;
    if (opts.context?.fbp) userData.fbp = opts.context.fbp;

    const body: Record<string, unknown> = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: opts.eventId,
          action_source: "website",
          user: userData,
          custom_data: {
            currency: "USD",
            value: Math.max(0, Math.round(opts.value)),
            contents: [{ id: "leaderboard_bid", quantity: 1 }],
            content_type: "product",
          },
        },
      ],
    };
    if (TEST_EVENT_CODE) body.test_event_code = TEST_EVENT_CODE;

    const res = await fetch(`${ENDPOINT}/${PIXEL_ID}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, access_token: TOKEN }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000), // never hold the webhook hostage
    });
    // Graph returns {events_received: N} on success; anything else is logged,
    // not thrown.
    const json = (await res.json()) as {
      events_received?: number;
      error?: { message?: string };
    };
    if (typeof json.events_received !== "number" || json.events_received < 1) {
      console.warn(
        "meta capi rejected event",
        opts.eventId,
        json.error?.message ?? JSON.stringify(json),
      );
    }
  } catch (e) {
    console.warn("meta capi send failed", e instanceof Error ? e.message : e);
  }
}
