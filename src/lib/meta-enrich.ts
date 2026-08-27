// Instagram enrichment job (Pattern B — docs/meta-enrichment.md).
//
// Root cause fixed at the source: Instagram login-walls every datacenter IP,
// so the ONLY fetch path is an unblocking proxy (IG_PROXY_URL). There are no
// fallback stacks — one source, the DB is the truth:
//
//   claim_meta_fetch (atomic) → proxied web_profile_info → avatar →
//   Supabase Storage (signed CDN URLs expire) → finish_meta_fetch.
//
// Interactive routes claim synchronously (a fast DB RPC) and run the job in
// `after()`; clients poll /api/preview until fetch_status is ok/failed.

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Platform } from "@/lib/platforms";
import { claimMetaFetch, finishMetaFetch, getMetaCached, MOCK_MODE, supabaseAdmin } from "@/lib/store";
import type { MetaClaim } from "@/lib/store";
import { MIME_BY_EXT, sniffImage } from "@/lib/image-sniff";

const execFileP = promisify(execFile);

// Job lease: must comfortably cover the worst proxied fetch + avatar upload.
export const IG_LEASE_SEC = 75;
// Claims per session before the row cools down for FAILED_COOLDOWN_SEC.
const IG_MAX_ATTEMPTS = 3;
// Backoff after the Nth failure (index attempts-1); the last value doubles
// as the give-up cooldown — a paste an hour later starts a fresh session.
const IG_BACKOFF_SEC = [5, 20, 3600];

// Wall-clock budget for one proxied profile fetch. Managed unblockers
// answer cached in ~1–3s; a fresh unlock can legitimately take 10s+.
const PROXY_BUDGET_MS = 45_000;
// Avatar download cap (bytes / ms) — profile pictures are tens of KB.
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TIMEOUT_MS = 10_000;

const LISTING_META_BUCKET = "listing-meta";

// The public Instagram web app id (the same one a browser sends).
const IG_APP_ID = "936619743392459";

/** Username from a canonical identity URL. */
function handleOf(identityUrl: string): string {
  return identityUrl.split("/").filter(Boolean).pop()?.replace(/^@/, "") ?? "";
}

function clampTitle(s: string | null): string | null {
  if (!s) return null;
  const clean = s.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 60 ? clean.slice(0, 57) + "…" : clean;
}

function clampDesc(s: string | null): string | null {
  if (!s) return null;
  const clean = s.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 150 ? clean.slice(0, 147) + "…" : clean;
}

// ── Proxy plumbing ─────────────────────────────────────────

export type ProxyMode =
  | { kind: "template"; url: string }          // query-param unblocker, {url} placeholder
  | { kind: "proxy"; host: string }            // plain proxy host[:port] (curl -x)
  | { kind: "brightdata"; token: string; zone: string } // brightdata Unlocker REST API
  | { kind: "dev-fixture" }                    // built-in deterministic fixture (no network)
  | null;                                      // unset — IG enrichment cannot run

/** Parse IG_PROXY_URL into a mode. Formats:
 *   brightdata://<api-key>?zone=web_unlocker1         → Unlocker REST API (POST)
 *   https://api.scraperapi.com/?api_key=…&url={url}   → template
 *   http://user:pass@brd.superproxy.io:44445          → proxy (needs their CA cert for https!)
 *   dev-fixture://                                     → local fixture (staging/dev) */
export function proxyMode(): ProxyMode {
  const v = (process.env.IG_PROXY_URL ?? "").trim();
  if (!v) return null;
  if (v === "dev-fixture://") return { kind: "dev-fixture" };
  if (v.startsWith("brightdata://")) {
    let zone = "web_unlocker1"; // Bright Data's default zone name
    const qi = v.indexOf("?");
    if (qi !== -1) {
      const q = new URLSearchParams(v.slice(qi + 1));
      if (q.get("zone")) zone = q.get("zone") as string;
    }
    return { kind: "brightdata", token: v.slice("brightdata://".length, qi === -1 ? undefined : qi), zone };
  }
  if (v.includes("{url}")) return { kind: "template", url: v };
  return { kind: "proxy", host: v };
}

/** Fetch JSON via the system curl binary. Returns {status, json} or null on
 *  transport errors / timeout / unparsable body. Supports GET or POST. */
async function curlJson(
  url: string,
  headers: Record<string, string>,
  ms: number,
  proxyHost?: string,
  opts: { method?: "GET" | "POST"; body?: string } = {}
): Promise<{ status: number; json: any } | null> {
  if (ms < 400) return null;
  try {
    const args = [
      "-s", "--compressed", "-m", `${Math.ceil(ms / 1000)}`,
      "-w", "\n%{http_code}",
      ...(opts.method === "POST" ? ["-X", "POST", "-d", opts.body ?? ""] : []),
      ...(proxyHost ? ["-x", proxyHost] : []),
      ...Object.entries(headers).flatMap(([k, v]) => ["-H", `${k}: ${v}`]),
      url,
    ];
    const { stdout } = await execFileP("curl", args, { timeout: ms + 500, maxBuffer: 5 * 1024 * 1024 });
    const lines = stdout.trimEnd().split("\n");
    const status = parseInt(lines.pop() ?? "", 10);
    if (!Number.isFinite(status)) return null;
    try {
      return { status, json: JSON.parse(lines.join("\n")) };
    } catch {
      return { status, json: null }; // non-JSON body (login wall HTML etc.)
    }
  } catch {
    return null;
  }
}

/** Deterministic fixture of a web_profile_info payload — activates only via
 *  IG_PROXY_URL=dev-fixture:// (staging/dev wiring check; never default).
 *  Usernames starting with "notfound" simulate a missing profile so the
 *  failure path is exercisable end-to-end. */
function devFixtureUser(username: string): any | null {
  if (username.startsWith("notfound")) return null;
  const seed = createHash("sha256").update(username).digest("hex").slice(0, 12);
  const pretty = username
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return {
    full_name: `${pretty} (fixture ${seed.slice(0, 4)})`,
    biography: `Dev-fixture profile for @${username} — generated by the enrichment pipeline smoke test.`,
    profile_pic_url: `https://picsum.photos/seed/${seed}/200`,
    is_private: false,
    is_verified: seed.charCodeAt(0) % 5 === 0,
  };
}

/** One proxied web_profile_info call. Returns the API `user` object, or
 *  throws with a short reason (surfaced to logs / finish_meta_fetch). */
export async function proxiedIgUser(username: string, ms = PROXY_BUDGET_MS): Promise<any> {
  const mode = proxyMode();
  if (!mode) throw new Error("IG_PROXY_URL unset — configure the unblocking proxy (docs/meta-enrichment.md)");
  if (mode.kind === "dev-fixture") {
    const user = devFixtureUser(username);
    if (!user) throw new Error("not_found (dev fixture)");
    return user;
  }
  const target =
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  let res: { status: number; json: any } | null;
  if (mode.kind === "brightdata") {
    // Unlocker REST API: the raw target body comes back as the response —
    // verified live: 200 + {data:{user:…}} on success; 200 + HTML body for a
    // missing profile; non-200 + {error:…} on auth/quota problems.
    res = await curlJson("https://api.brightdata.com/request", {
      authorization: `Bearer ${mode.token}`,
      "content-type": "application/json",
    }, ms, undefined, {
      method: "POST",
      body: JSON.stringify({ zone: mode.zone, url: target, format: "raw" }),
    });
    if (res && res.status === 200 && res.json?.error) {
      throw new Error(`brightdata: ${String(res.json.error).slice(0, 100)}`);
    }
  } else {
    const headers = { "x-ig-app-id": IG_APP_ID, accept: "*/*" };
    res =
      mode.kind === "template"
        ? await curlJson(mode.url.replace("{url}", encodeURIComponent(target)), headers, ms)
        : await curlJson(target, headers, ms, mode.host);
  }
  if (!res) throw new Error("proxy transport failed / timeout");
  if (res.status === 404) throw new Error("not_found");
  if (res.status !== 200) throw new Error(`proxy status ${res.status}`);
  const user = res.json?.data?.user;
  if (!user) {
    throw new Error(
      res.json == null
        ? "non-JSON body (login wall / not found)"
        : res.json?.message
          ? `ig: ${String(res.json.message).slice(0, 80)}`
          : "no user object"
    );
  }
  return user;
}

// ── Avatar persistence ─────────────────────────────────────

/** Download + sniff + upload a platform avatar into the listing-meta bucket.
 *  Returns the durable public URL (path = sha256 of the identity URL, so a
 *  later refresh overwrites in place and URLs stay stable forever), or null
 *  when anything fails — the caller then keeps whatever URL it had. */
async function persistAvatar(identityUrl: string, cdnUrl: string | null): Promise<string | null> {
  if (!cdnUrl || !/^https:\/\//.test(cdnUrl)) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AVATAR_TIMEOUT_MS);
    let bytes: Uint8Array;
    try {
      const r = await fetch(cdnUrl, { signal: ctrl.signal, redirect: "follow" });
      if (!r.ok) return null;
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > AVATAR_MAX_BYTES) return null;
      bytes = buf;
    } finally {
      clearTimeout(timer);
    }
    const ext = sniffImage(bytes);
    if (!ext) return null;
    const path = `${createHash("sha256").update(identityUrl).digest("hex")}.${ext}`;
    const up = await supabaseAdmin()
      .storage
      .from(LISTING_META_BUCKET)
      .upload(path, bytes, { contentType: MIME_BY_EXT[ext], upsert: true, cacheControl: "31536000" });
    if (up.error) {
      console.error("[enrich] avatar upload failed", up.error.message);
      return null;
    }
    return supabaseAdmin().storage.from(LISTING_META_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return null; // offline / CDN expiry — keep the previous URL if any
  }
}

// ── The job ────────────────────────────────────────────────

export type EnrichResult = {
  claimed: boolean;          // this call owned the lease
  ok: boolean;               // data persisted
  reason?: string;           // failure short-reason
  meta?: { title: string | null; description: string | null; image: string | null };
};

/** Claim the lease only (fast, safe inline in a request handler).
 *  Returns what the caller should do: "run" → schedule runInstagramEnrichment. */
export function claimInstagramEnrichment(
  url: string,
  platform: Platform,
  opts: { force?: boolean } = {}
): Promise<MetaClaim> {
  return claimMetaFetch(url, platform, {
    leaseSec: IG_LEASE_SEC,
    maxAttempts: IG_MAX_ATTEMPTS,
    force: opts.force,
  });
}

/** Run the enrichment job after a successful claim (in after()/cron). Never
 *  throws — every exit path writes its terminal state. */
export async function runInstagramEnrichment(
  url: string,
  platform: Platform,
  attempts: number
): Promise<EnrichResult> {
  if (MOCK_MODE) return { claimed: false, ok: false, reason: "mock mode — no job machinery" };
  const username = handleOf(url);
  const t0 = Date.now();
  try {
    const user = await proxiedIgUser(username);
    const title = clampTitle(user.full_name || null);
    const description = clampDesc(user.biography ?? null);
    const avatar = await persistAvatar(url, user.profile_pic_url ?? null);
    const meta = { title, description, image: avatar ?? (user.profile_pic_url ?? null) };
    if (!title && !description && !meta.image) {
      // A "successful" fetch with zero usable fields is a failure — the
      // client must keep polling / the row must not claim to be ok.
      throw new Error("empty profile payload");
    }
    await finishMetaFetch(url, true, meta);
    console.log(`[enrich] ok ${username} ${Date.now() - t0}ms${avatar ? " avatar=stored" : ""}`);
    return { claimed: true, ok: true, meta };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const backoff = IG_BACKOFF_SEC[Math.min(attempts - 1, IG_BACKOFF_SEC.length - 1)];
    await finishMetaFetch(url, false, null, backoff);
    console.log(`[enrich] fail ${username} attempt ${attempts} backoff ${backoff}s — ${reason}`);
    return { claimed: true, ok: false, reason };
  }
}

/** Serve-side read for preview/checkout: cached row → preview meta shape. */
export async function cachedIgMeta(
  url: string
): Promise<{ meta: { title: string | null; description: string | null; image: string | null } | null; fetchStatus: "pending" | "ok" | "failed" }> {
  const row = await getMetaCached(url);
  const hasData = !!(row && (row.title || row.description || row.image_url));
  return {
    meta: hasData
      ? { title: row.title, description: row.description, image: row.image_url }
      : null,
    fetchStatus: hasData ? "ok" : (row?.fetch_status ?? "failed"),
  };
}
