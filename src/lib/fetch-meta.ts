// Smart fetching: best-effort public data for the preview card.
// Never throws, never blocks longer than OVERALL_BUDGET_MS per lookup.
//
// Coverage by platform (spec phases):
//  - website: Open Graph image/title/description + favicon (solid)
//  - app:     iTunes Lookup API (App Store) / page OG tags (Play Store)
//  - x:       logged-out profile OG tags → publish.x.com oEmbed fallback
//  - tiktok:  tiktok.com oEmbed (nickname) + embedded
//             __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON (avatar, bio —
//             oEmbed no longer returns thumbnail_url and pages lost og: tags)
//  - instagram: web_profile_info endpoint (via curl — Node's fetch TLS
//             fingerprint gets 429'd on datacenter IPs) + page OG fallback
//             + Wayback Machine fallback (IG now login-walls every server
//             IP; archived copies carry bio/avatar via embedded JSON, and
//             avatars replay through web.archive.org after CDN expiry).
//             Successful results persist to the Supabase meta_cache table,
//             which also serves as durable last-known-good on failures.
//  - linkedin: page OG tags (usually login-walled → clean fallback)

import type { Platform } from "@/lib/platforms";
import { getMetaCached, setMetaCached } from "@/lib/store";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export type ListingMeta = {
  title: string | null;       // full name / app name / site title
  description: string | null; // bio / headline / og:description (≤150 chars)
  image: string | null;       // profile picture / app icon / og:image
};

// Hard ceiling for one complete platform lookup. Every upstream call gets a
// slice of this budget; no chain of retries/fallbacks can exceed it, so the
// preview endpoint always answers within ~this time (worst case), and almost
// always within ~2s when platforms are healthy.
const OVERALL_BUDGET_MS = 9000;
// Instagram gets more headroom: its only reliable server-side data source
// (Wayback Machine) can be slow, and the route declares maxDuration = 15.
const IG_BUDGET_MS = 12500;
// Cap for any single HTTP request / curl invocation inside that budget.
const REQ_TIMEOUT_MS = 4000;
const FETCH_RETRIES = 1;      // one retry on 429/5xx/network errors
const RETRY_DELAY_MS = 500;
const CACHE_TTL_MS = 10 * 60_000;
// Failed fetches are remembered briefly so typing bursts don't hammer the
// upstream platform while the user edits the same handle — but short enough
// that an immediate re-paste can retry after a transient failure.
const NEG_CACHE_TTL_MS = 15_000;
// A Supabase-cached result newer than this is served without any upstream
// trip. Older rows are re-fetched live (best effort); on failure the stale
// row still serves — old data beats no data for a preview card.
const META_STALE_MS = 7 * 24 * 60 * 60_000;
// Wayback captures whose WARC record (compressed size, bytes) sits below
// this are login-wall shells / redirect junk, not real profile pages.
// Observed shells ≈8–15KB; real profiles ≥31KB even for the biggest
// accounts (small accounts 90KB+, celebrity pages 130–190KB). Filtering by
// the index's own `length` column skips dead captures for free instead of
// burning a ~4–5s download slot on each.
const WAYBACK_MIN_CAPTURE_BYTES = 34_000;

// Browser-like UA for page scraping: WAF rules commonly 403 short bot-style
// UAs, while og-tag scraping with a browser UA succeeds broadly.
const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
// Identifiable UA for open JSON APIs (oEmbed endpoints etc.) that don't care.
const UA_API =
  "Mozilla/5.0 (compatible; outbidarabs/2.0; +https://outbidarabs.lol)";

type CacheEntry = { expires: number; value: ListingMeta | null };
type MetaState = {
  cache?: Map<string, CacheEntry>;
  lastGood?: Map<string, ListingMeta>;
  inflight?: Map<string, Promise<ListingMeta>>;
  igCooldownUntil?: number;
};
const stateStore = globalThis as unknown as { __metaState?: MetaState };
function state(): MetaState {
  if (!stateStore.__metaState) stateStore.__metaState = {};
  return stateStore.__metaState;
}
function cache(): Map<string, CacheEntry> {
  const s = state();
  if (!s.cache) s.cache = new Map();
  return s.cache;
}

function trimMap<T>(m: Map<string, T>): void {
  if (m.size > 300) m.delete(m.keys().next().value as string);
}

function cacheGet(key: string): ListingMeta | null | undefined {
  const hit = cache().get(key);
  if (!hit) return undefined; // not seen before
  if (hit.expires < Date.now()) {
    cache().delete(key);
    return undefined;
  }
  return hit.value; // null = recently failed
}

function cacheSet(key: string, value: ListingMeta | null): void {
  const c = cache();
  trimMap(c);
  c.set(key, {
    expires: Date.now() + (value ? CACHE_TTL_MS : NEG_CACHE_TTL_MS),
    value,
  });
}

function rememberGood(key: string, value: ListingMeta): void {
  const lg = state().lastGood ?? (state().lastGood = new Map());
  trimMap(lg);
  lg.set(key, value);
}

/**
 * Budget shared by every attempt of one platform lookup. take(cap) returns
 * how long the caller may spend right now (0 → nothing left, skip attempt).
 */
type Budget = { take(cap: number): number };
function makeBudget(totalMs: number): Budget {
  return budgetUntil(Date.now() + totalMs);
}
/** Deadline-anchored budget: whatever time remains until endAt. */
function budgetUntil(endAt: number): Budget {
  return {
    /** Returns milliseconds to spend, or 0 when the budget is exhausted. */
    take(cap: number): number {
      const ms = Math.min(cap, endAt - Date.now());
      return ms >= 400 ? Math.round(ms) : 0;
    },
  };
}

async function timedFetch(
  url: string,
  headers: Record<string, string> | undefined,
  ms: number
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": UA_API, ...(headers ?? {}) },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

const isTransient = (status: number) => status === 429 || status >= 500;

/** Fetch with ≤FETCH_RETRIES transient-failure retries. Each attempt draws
 *  its own slice from the shared Budget, so retries can never push the whole
 *  platform lookup past OVERALL_BUDGET_MS. */
async function fetchResilient(
  url: string,
  headers: Record<string, string> | undefined,
  b: Budget,
  capMs = REQ_TIMEOUT_MS
): Promise<Response | null> {
  let last: Response | null = null;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    const ms = b.take(capMs);
    const res = ms > 0 ? await timedFetch(url, headers, ms).catch(() => null) : null;
    if (!res || isTransient(res.status)) {
      if (res) last = res;
      if (attempt < FETCH_RETRIES) {
        const wait = b.take(RETRY_DELAY_MS);
        if (wait > 0) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
      }
      return last;
    }
    return res;
  }
  return last;
}

/** Fetch JSON via the system curl binary, surfacing the HTTP status so the
 *  caller can inspect error bodies (Instagram's IP-lockout payload arrives
 *  as 401 with JSON, not as transport failure). Returns null on transport
 *  errors / missing curl / timeout / unparsable body. */
async function curlJson(
  url: string,
  headers: Record<string, string>,
  ms: number // pre-sliced budget (caller decides how much this stage may cost)
): Promise<{ status: number; json: any } | null> {
  if (ms < 400) return null;
  try {
    const args = [
      "-s", "--compressed", "-m", `${Math.ceil(ms / 1000)}`,
      "-w", "\n%{http_code}",
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
      return null; // non-JSON body
    }
  } catch {
    return null; // curl missing / timeout
  }
}

/** Fetch text via the system curl binary, surfacing the HTTP status and
 *  final (post-redirect) URL. Single attempt, no retry — the caller owns
 *  the budget slice. Returns null on transport errors / missing curl. */
async function curlText(
  url: string,
  headers: Record<string, string>,
  ms: number // pre-sliced budget
): Promise<{ status: number; body: string; url: string } | null> {
  if (ms < 400) return null;
  try {
    const args = [
      "-sL", "--compressed", "-m", `${Math.ceil(ms / 1000)}`,
      "-w", "\n%{http_code}\n%{url_effective}",
      ...Object.entries(headers).flatMap(([k, v]) => ["-H", `${k}: ${v}`]),
      url,
    ];
    const { stdout } = await execFileP("curl", args, { timeout: ms + 500, maxBuffer: 5 * 1024 * 1024 });
    const lines = stdout.split("\n");
    const finalUrl = (lines.pop() ?? "").trim();
    const status = parseInt(lines.pop() ?? "", 10);
    if (!Number.isFinite(status)) return null;
    return { status, body: lines.join("\n"), url: finalUrl || url };
  } catch {
    return null; // curl missing / timeout
  }
}

async function fetchJson(
  url: string,
  headers: Record<string, string> | undefined,
  b: Budget
): Promise<any | null> {
  const res = await fetchResilient(url, headers, b);
  if (!res || !res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchHtml(
  url: string,
  headers: Record<string, string> | undefined,
  b: Budget
): Promise<string | null> {
  const browserish = headers?.["user-agent"] ?? UA_BROWSER;
  const res = await fetchResilient(
    url,
    { ...headers, "user-agent": browserish },
    b,
    REQ_TIMEOUT_MS + RETRY_DELAY_MS
  );
  if (!res || !res.ok) return null;
  try {
    // Some pages (Google Play) inline ~1MB of JSON before the og: tags.
    return (await res.text()).slice(0, 2_000_000);
  } catch {
    return null;
  }
}

/** Run tasks concurrently, resolve with the first non-null result (or null). */
async function raceSuccess<T>(tasks: Array<() => Promise<T | null>>): Promise<T | null> {
  let pending = tasks.length;
  if (!pending) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    for (const t of tasks) {
      t()
        .then((v) => {
          if (v != null && !settled) {
            settled = true;
            resolve(v);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (--pending === 0 && !settled) resolve(null);
        });
    }
  });
}

/** Module-global pacer: guarantees ≥minGapMs between upstream trips started
 *  from this instance, no matter how many requests arrive concurrently.
 *  Instagram locks out datacenter IPs ("Please wait a few minutes") when
 *  pasted-handle bursts fire back-to-back — spreading the trips keeps the
 *  shared Vercel egress IP inside the allowed request rate.
 *  A task may return SKIP to opt out of the post-run gap (it did no I/O,
 *  e.g. aborted because a sibling discovered a lockout mid-burst). */
const PACE_SKIP = Symbol("pace-skip");
function makePacer(minGapMs: number) {
  const st = globalThis as unknown as { __igPaceChain?: Promise<void> };
  return function paced<T>(fn: () => Promise<T>): Promise<T> {
    const run = (st.__igPaceChain ?? Promise.resolve()).then(fn);
    const tail = run.then(
      (v) =>
        v === PACE_SKIP
          ? Promise.resolve()
          : new Promise<void>((r) => setTimeout(r, minGapMs)),
      () => new Promise<void>((r) => setTimeout(r, minGapMs))
    );
    st.__igPaceChain = tail;
    return run;
  };
}
// One chain per instance; separate chains for the curl and node-fetch routes
// would double-trip the limiter, so everything goes through this one.
const paceInstagramUpstream = makePacer(1500);

function htmlMeta(html: string, prop: string): string | null {
  // [^"<>] (not [^"']) so apostrophes inside values ("I'm …") don't truncate
  const m = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"<>]{2,600})["']`, "i")
  );
  if (m) return decodeHtmlEntities(m[1]);
  // reversed attribute order (content before property)
  const m2 = html.match(
    new RegExp(`<meta[^>]+content=["']([^"<>]{2,600})["'][^>]+(?:property|name)=["']${prop}["']`, "i")
  );
  return m2 ? decodeHtmlEntities(m2[1]) : null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/gi, "'")
    .trim();
}

function safeCodePoint(n: number): string {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff
    ? String.fromCodePoint(n)
    : "";
}

/** Decode a raw JSON string-literal fragment (contents between the quotes). */
function jsonStr(raw: string): string | null {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return null;
  }
}

function resolveUrl(image: string | null, base: string): string | null {
  if (!image) return null;
  try {
    return new URL(image, base).toString();
  } catch {
    return null;
  }
}

function clampDesc(s: string | null): string | null {
  if (!s) return null;
  const clean = s.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 150 ? clean.slice(0, 147) + "…" : clean;
}

function clampTitle(s: string | null): string | null {
  if (!s) return null;
  const clean = s.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 60 ? clean.slice(0, 57) + "…" : clean;
}

/** Extract the username from a canonical identity URL. */
function handleOf(identityUrl: string): string {
  return identityUrl.split("/").filter(Boolean).pop()?.replace(/^@/, "") ?? "";
}

const hasData = (m: ListingMeta) => !!(m.title || m.description || m.image);

// ── Platform fetchers ──────────────────────────────────────

// Instagram occasionally locks out whole egress IPs for minutes (API
// answers 401 "Please wait a few minutes", profile pages redirect to
// /accounts/login). While the cooldown is active we skip all upstream trips
// — extra requests cannot succeed and only deepen the lockout.
function markInstagramLocked(ms = 90_000): void {
  state().igCooldownUntil = Date.now() + ms;
}
function instagramCoolingDown(): boolean {
  return Date.now() < (state().igCooldownUntil ?? 0);
}
/** Recognize Instagram's lockout payloads. */
function igSaysLimited(j: any): boolean {
  return (
    !!j &&
    (j.require_login === true ||
      /please wait|try again later|rate limit/i.test(String(j.message ?? "")))
  );
}

async function fetchInstagram(identityUrl: string, _href: string, b: Budget): Promise<ListingMeta> {
  const username = handleOf(identityUrl);
  // Stage 3 starts immediately — the archive.org replay is the slowest hop
  // and the only reliable one from server IPs — but its result is used only
  // if the fresher stages come up empty (preference: live API > page OG
  // tags > archived copy). Never awaited when an earlier stage succeeds.
  const wayback = waybackInstagram(username, b);
  // Stage 1 — the web app's own profile endpoint (public app id). Node's
  // fetch gets 429'd by TLS fingerprint on datacenter IPs — race curl
  // against plain fetch across both API hosts; whichever answers first
  // wins. Bounded so it can't eat the shared deadline on its own.
  const user = await instagramLiveApi(username, makeBudget(3500));
  if (user) {
    return {
      title: clampTitle(user.full_name || null),
      description: clampDesc(user.biography ?? null),
      image: user.profile_pic_url ?? null,
    };
  }
  // Stage 2 — profile page OG tags (usually login-walled from server IPs,
  // but cheap to try when not cooling down).
  if (!instagramCoolingDown()) {
    const base = `https://www.instagram.com/${username}/`;
    const html = await fetchHtml(base, undefined, makeBudget(2000));
    if (html) {
      const title = htmlMeta(html, "og:title");
      // Login redirect = page-level gate. Short cooldown so the next pastes
      // skip straight to the archive fallback instead of re-hitting the wall.
      if (!title && /accounts\/(login|challenge)/.test(html.slice(0, 5000))) {
        markInstagramLocked(45_000);
      } else {
        const desc = htmlMeta(html, "og:description");
        const image = resolveUrl(htmlMeta(html, "og:image"), base);
        const meta: ListingMeta = {
          title: title && !/^instagram(\.com)?$/i.test(title) ? clampTitle(title) : null,
          description:
            desc && !/^instagram(\.com)?$/i.test(desc) && !/sign ?up to see|log ?in to see/i.test(desc)
              ? clampDesc(desc)
              : null,
          image: image && !/rsrc\.php/.test(image) ? image : null,
        };
        if (hasData(meta)) return meta;
      }
    }
  }
  // Stage 3 — Wayback Machine: Instagram now login-walls every server IP,
  // but archived copies of the profile page carry og: tags (avatar) plus
  // the full embedded profile JSON (biography, full_name). Data can be
  // months stale — acceptable for a preview card. Independent of IG
  // lockouts, so it runs even while the cooldown above is active.
  return wayback;
}

/** Live web_profile_info race. All upstream trips go through the shared
 *  pacer (≥1.5s apart) so bursts don't trip Instagram's per-IP lockout on
 *  the datacenter egress; a lockout payload aborts remaining tries
 *  immediately. Each task draws its budget slice only when it actually
 *  runs (pacer slots can arrive seconds after construction). Returns the
 *  API `user` object or null. */
async function instagramLiveApi(username: string, b: Budget): Promise<any | null> {
  // Already locked out recently — don't touch the network at all.
  if (instagramCoolingDown()) return null;
  const apiOf = (host: string) =>
    `https://${host}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const igHeaders = { "x-ig-app-id": "936619743392459", accept: "*/*" };
  const apiTask = (run: (b: Budget) => Promise<any | null>): (() => Promise<any | null>) =>
    // Cooldown check sits OUTSIDE the pacer so fully-skipped tries never
    // touch the chain; the inner check (before any I/O) aborts an already-
    // queued try without costing the followers their 1.5s slot.
    () =>
      instagramCoolingDown()
        ? Promise.resolve(null)
        : paceInstagramUpstream(async () => {
            if (instagramCoolingDown()) return PACE_SKIP;
            const r = await run(b);
            if ((r && igSaysLimited(r.json)) || isTransient(r?.status ?? 0)) {
              markInstagramLocked();
              return PACE_SKIP;
            }
            const u = r?.json?.data?.user;
            return u ? r : null;
          }).then((v) => (v === PACE_SKIP ? null : v));
  const j = await raceSuccess([
    apiTask((bb) => curlJson(apiOf("i.instagram.com"), igHeaders, bb.take(4000))),
    apiTask((bb) => curlJson(apiOf("www.instagram.com"), igHeaders, bb.take(3000))),
    apiTask((bb) => fetchJson(apiOf("i.instagram.com"), igHeaders, bb)),
    apiTask((bb) => fetchJson(apiOf("www.instagram.com"), igHeaders, bb)),
  ]);
  return j?.data?.user ?? null;
}

/** Instagram profile data from the Wayback Machine. Archived copies of
 *  the profile page carry og: tags (avatar) plus the full embedded profile
 *  JSON (biography, full_name). Fast path: timestampless replay redirects
 *  straight to the nearest capture — one round trip, no index lookup. If
 *  that capture is junk or stalls, the CDX index enumerates alternates and
 *  (length-filtered) captures are walked newest-first, two at a time. */
async function waybackInstagram(username: string, b: Budget): Promise<ListingMeta> {
  const tried = new Set<string>();
  // Both archive.org hops START TOGETHER and are CONSUMED TOGETHER: archive
  // throughput swings wildly (even a small CDX JSON or a ~1MB profile page
  // can take anywhere from 1s to 10s depending on the minute), and awaiting
  // the timestampless replay serially strands the capture walk behind a
  // dead 503 login-shell capture. curl (not Node fetch) for page bodies:
  // undici's transfer stalls against archive.org from some egress IPs.
  const wbHeaders = { "user-agent": UA_BROWSER, accept: "text/html,*/*" };
  const replayP = curlText(
    `https://web.archive.org/web/${new Date().getFullYear() + 1}id_/https://www.instagram.com/${username}/`,
    wbHeaders,
    b.take(3000)
  );
  // The CDX index gets its own capped slice via a deadline-anchored sub-
  // budget, and BOTH transports race: archive.org regularly stalls mid-
  // transfer on undici while curl sails through (and vice versa). Whichever
  // yields valid JSON first wins.
  const cdxUrl =
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(`instagram.com/${username}`)}` +
    `&output=json&filter=statuscode:200&collapse=digest&limit=-16`;
  const cdxFetchMs = Math.max(b.take(5000), 0);
  const cdxCurlMs = Math.max(b.take(5000), 0);
  const cdxP = raceSuccess([
    () => (cdxFetchMs >= 400 ? fetchJson(cdxUrl, undefined, budgetUntil(Date.now() + cdxFetchMs)) : Promise.resolve(null)),
    () => curlJson(cdxUrl, { "user-agent": UA_BROWSER, accept: "application/json" }, cdxCurlMs),
  ]);
  const [at, cdx0] = await Promise.all([replayP.catch(() => null), cdxP]);
  // Patient callers (background heal, cron) get a second CDX attempt with a
  // fat slice when the first one starved: archive.org regularly serves even
  // its small JSON in ~7-9s during congested minutes — slower than any sane
  // interactive slice, but fine once the response already shipped.
  let cdx = cdx0;
  if (!Array.isArray(cdx)) {
    const retryMs = Math.max(b.take(10_000), 0);
    if (retryMs >= 4000) {
      cdx = await raceSuccess([
        () => fetchJson(cdxUrl, undefined, budgetUntil(Date.now() + retryMs)),
        () => curlJson(cdxUrl, { "user-agent": UA_BROWSER, accept: "application/json" }, retryMs),
      ]);
    }
  }
  const ts = at?.url.match(/\/web\/(\d{4,14})id_\//)?.[1] ?? null;
  if (at && at.status === 200 && at.body && ts && at.body.length > WAYBACK_MIN_CAPTURE_BYTES) {
    tried.add(ts);
    const meta = parseArchivedInstagram(at.body.slice(0, 2_000_000), username, ts);
    if (hasData(meta)) return meta;
  }
  // CDX rows ascend oldest→newest — REVERSE so the walk tries the freshest
  // capture first, and pre-filter by WARC record size: tiny rows are
  // login-wall shells (downloading one wastes several costly seconds of
  // shared budget on a page that can never parse). Larger junk shells still
  // exist, so keep parsing each until one yields data.
  const stamps = Array.isArray(cdx)
    ? cdx
        .slice(1)
        .filter(
          (r) =>
            Array.isArray(r) && /^\d+$/.test(String(r[1] ?? "")) && Number(r[6] ?? 0) >= WAYBACK_MIN_CAPTURE_BYTES
        )
        .map((r) => String(r[1]))
        .reverse()
    : [];
  // Walk in pairs with budgets sliced UPFRONT (two parallel downloads can
  // never overdraw the shared deadline), preferring the newer capture.
  for (let i = 0; i < stamps.length; i += 2) {
    if (b.take(1500) === 0) break; // nothing left worth starting a multi-second hop
    const pair = stamps.slice(i, i + 2).filter((t) => !tried.has(t));
    pair.forEach((t) => tried.add(t));
    if (!pair.length) continue;
    const slices = pair.map(() => b.take(6000)).filter((ms) => ms >= 1000);
    const bodies = await Promise.all(
      pair.slice(0, slices.length).map(
        (t, k) =>
          curlText(`https://web.archive.org/web/${t}id_/https://www.instagram.com/${username}/`, wbHeaders, slices[k])
      )
    );
    for (let k = 0; k < bodies.length; k++) {
      const r = bodies[k];
      if (!r || r.status !== 200 || !r.body || r.body.length < WAYBACK_MIN_CAPTURE_BYTES) continue;
      const meta = parseArchivedInstagram(r.body.slice(0, 2_000_000), username, pair[k]);
      if (hasData(meta)) return meta;
    }
  }
  return { title: null, description: null, image: null };
}

/** Extract listing meta from an archived instagram.com/{user}/ snapshot.
 *  Exported for offline unit checks (scripts / node --test). */
export function parseArchivedInstagram(html: string, username: string, ts: string): ListingMeta {
  // Embedded profile JSON: suggested/related accounts are embedded on the
  // same page, so attribute each biography to its nearest "username" and
  // keep the one belonging to this user. Layout within the owner node:
  // …"biography":"…","full_name":"…","is_verified":…
  const allBios = [...html.matchAll(/"biography":"((?:[^"\\]|\\.)*)"/g)];
  const own =
    allBios.find((m) => {
      const before = html.lastIndexOf('"username":"', m.index);
      const after = html.indexOf('"username":"', m.index);
      const at =
        before >= 0 && (after < 0 || m.index - before < after - m.index) ? before : after;
      if (at < 0) return false;
      return html.slice(at + 12, html.indexOf('"', at + 12)) === username;
    }) ?? (allBios.length === 1 ? allBios[0] : undefined);
  const bio = own ? jsonStr(own[1]) : null;
  const fullName = own
    ? jsonStr(
        html
          .slice(own.index + own[0].length, own.index + own[0].length + 500)
          .match(/^,"full_name":"((?:[^"\\]|\\.)*)"/)?.[1] ?? ""
      )
    : null;
  // og:title: "Display Name (@handle) • Instagram photos and videos"
  const ogTitle = htmlMeta(html, "og:title");
  const ogName = ogTitle?.match(/^(.*?)\s*\(@/)?.[1].trim() ?? null;
  // og:image: original CDN URL whose signature has long expired — replay
  // it through the archive so the avatar keeps resolving for <img> tags.
  const ogImage = htmlMeta(html, "og:image");
  const image =
    ogImage && !/rsrc\.php/.test(ogImage)
      ? `https://web.archive.org/web/${ts}im_/${ogImage}`
      : null;
  return {
    title: clampTitle(fullName || ogName || null),
    description: clampDesc(bio),
    image,
  };
}

async function fetchTikTok(identityUrl: string, _href: string, b: Budget): Promise<ListingMeta> {
  const username = handleOf(identityUrl);
  const base = `https://www.tiktok.com/@${username}`;
  // Public oEmbed: nickname only these days (thumbnail_url is no longer sent
  // for profile URLs). Fill the rest from the profile page's embedded
  // __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON (og: tags are gone from
  // logged-out profile HTML).
  const j = await fetchJson(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(base)}`,
    undefined,
    b
  );
  let title = clampTitle(j?.author_name ?? null);
  let description: string | null = null;
  let image = resolveUrl(j?.thumbnail_url ?? null, "https://www.tiktok.com/");
  if (!title || !image) {
    const html = await fetchHtml(base, undefined, b);
    if (html) {
      const blob = html.match(
        /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s
      )?.[1];
      let user: any;
      try {
        user = blob
          ? JSON.parse(blob)?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo?.user
          : undefined;
      } catch {
        user = undefined; // malformed embed — fall through to OG tags
      }
      if (user) {
        title ||= clampTitle(user.nickname ?? null);
        image ||= resolveUrl(user.avatarLarger ?? user.avatarMedium ?? null, "https://www.tiktok.com/");
        description = clampDesc(user.signature ?? null);
      } else {
        const ogTitle = htmlMeta(html, "og:title");
        title ||= clampTitle(
          ogTitle?.replace(/\s*\(@[^)]*\)\s*/g, " ").replace(/\s*[|·]\s*TikTok\s*$/i, "").trim() ?? null
        );
        image ||= resolveUrl(htmlMeta(html, "og:image"), "https://www.tiktok.com/");
      }
    }
  }
  return { title, description, image };
}

async function fetchX(identityUrl: string, _href: string, b: Budget): Promise<ListingMeta> {
  const username = handleOf(identityUrl);
  // X's logged-out profile page carries og:title ("Name (@handle) on X"),
  // og:description (bio) and og:image (real avatar) — verified from the
  // Vercel runtime. Browser UA keeps the full meta set served.
  const html = await fetchHtml(`https://x.com/${username}`, {
    "accept-language": "en-US,en;q=0.9",
  }, b);
  if (html) {
    const ogTitle = htmlMeta(html, "og:title");
    const name = ogTitle?.match(/^(.+?)\s*\(@[^)]*\)\s*on X$/i)?.[1] ?? ogTitle;
    const meta: ListingMeta = {
      title: clampTitle(name ?? null),
      description: clampDesc(htmlMeta(html, "og:description")),
      image: resolveUrl(htmlMeta(html, "og:image"), `https://x.com/${username}`),
    };
    if (hasData(meta)) return meta;
  }
  // Fallback: public oEmbed (display name only, no avatar).
  const j = await fetchJson(
    `https://publish.x.com/oembed?url=${encodeURIComponent(`https://x.com/${username}`)}`,
    undefined,
    b
  );
  let title: string | null = j?.author_name ?? null;
  if (!title && typeof j?.html === "string") {
    title = j.html.match(/Posts by (.+?)<\/?/)?.[1] ?? null;
  }
  return {
    title: clampTitle(title),
    description: null,
    image: null,
  };
}

async function fetchLinkedIn(_identityUrl: string, href: string, b: Budget): Promise<ListingMeta> {
  // Usually login-walled; try OG tags once and fall back cleanly.
  const html = await fetchHtml(href, undefined, b);
  if (!html) return { title: null, description: null, image: null };
  return {
    title: clampTitle(htmlMeta(html, "og:title")),
    description: clampDesc(htmlMeta(html, "og:description") ?? htmlMeta(html, "description")),
    image: resolveUrl(htmlMeta(html, "og:image"), href),
  };
}

async function fetchWebsite(_identityUrl: string, href: string, b: Budget): Promise<ListingMeta> {
  const html = await fetchHtml(href, undefined, b);
  if (!html) return { title: null, description: null, image: null };
  const titleTag = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i)?.[1] ?? null;
  return {
    title: clampTitle(htmlMeta(html, "og:title") ?? (titleTag ? decodeHtmlEntities(titleTag) : null)),
    description: clampDesc(htmlMeta(html, "og:description") ?? htmlMeta(html, "description")),
    image: resolveUrl(
      htmlMeta(html, "og:image") ?? htmlMeta(html, "twitter:image"),
      href
    ),
  };
}

async function fetchApp(_identityUrl: string, href: string, b: Budget): Promise<ListingMeta> {
  if (href.startsWith("https://apps.apple.com")) {
    const id = href.match(/\/id(\d+)/)?.[1];
    if (!id) return { title: null, description: null, image: null };
    const country = href.match(/apps\.apple\.com\/([a-z]{2})\//i)?.[1] ?? "us";
    const j = await fetchJson(
      `https://itunes.apple.com/lookup?id=${id}&country=${country}`,
      undefined,
      b
    );
    const app = j?.results?.[0];
    if (app) {
      return {
        title: clampTitle(app.trackName ?? null),
        description: clampDesc(app.description ?? app.genre ?? null),
        image: app.artworkUrl512 ?? app.artworkUrl100 ?? null,
      };
    }
    // Fallback: App Store page OG tags
    const html = await fetchHtml(href, undefined, b);
    if (!html) return { title: null, description: null, image: null };
    return {
      title: clampTitle(htmlMeta(html, "og:title")),
      description: clampDesc(htmlMeta(html, "og:description")),
      image: resolveUrl(htmlMeta(html, "og:image"), href),
    };
  }
  // Google Play: page OG tags (og:image = app icon, og:title = app name)
  const html = await fetchHtml(href, undefined, b);
  if (!html) return { title: null, description: null, image: null };
  const rawTitle = htmlMeta(html, "og:title");
  const title = rawTitle
    ? rawTitle.replace(/\s*[-–—]\s*(Apps|الألعاب) on Google Play\s*$/i, "").replace(/\s*[-–—]\s*تطبيقات على Google Play\s*$/i, "")
    : null;
  return {
    title: clampTitle(title),
    description: clampDesc(htmlMeta(html, "og:description") ?? htmlMeta(html, "description")),
    image: resolveUrl(htmlMeta(html, "og:image"), href),
  };
}

/**
 * Entry point: platform-aware fetch with caching. Never throws, never
 * exceeds OVERALL_BUDGET_MS even when every upstream is slow or down.
 *
 * Resilience layers:
 *  - success cache (10 min) and negative cache (15 s) per identity
 *  - single-flight: concurrent identical lookups share one upstream trip
 *  - last-known-good: a failed live fetch still serves stale metadata
 *    rather than degrading the card to the bare platform icon
 */
export type FetchMetaOptions = {
  /** Override the per-lookup wall-clock ceiling. The defaults keep an
   *  interactive paste fast; background callers (heal cron, post-response
   *  retry) pass a larger value to ride out slow archive.org minutes. */
  budgetMs?: number;
  /** Skip the negative-cache short-circuit so a background retry actually
   *  goes upstream even though an interactive attempt just failed. */
  force?: boolean;
};

export async function fetchListingMeta(
  platform: Platform,
  identityUrl: string,
  href: string,
  opts: FetchMetaOptions = {}
): Promise<ListingMeta> {
  const key = `${platform}:${identityUrl}`;
  const hit = cacheGet(key);
  if (hit !== undefined && !opts.force) {
    return hit ?? { title: null, description: null, image: null };
  }

  // Durable cache (Supabase) — survives lambda restarts. A fresh-enough row
  // answers the lookup with zero upstream trips; a stale row is still kept
  // in hand for when the live fetch fails (Instagram lockouts).
  const durable = await getMetaCached(identityUrl).catch(() => null);
  if (
    durable &&
    (durable.title || durable.description || durable.image_url) &&
    Date.now() - new Date(durable.fetched_at).getTime() < META_STALE_MS
  ) {
    const served: ListingMeta = {
      title: durable.title,
      description: durable.description,
      image: durable.image_url,
    };
    cacheSet(key, served);
    rememberGood(key, served);
    return served;
  }

  const s = state();
  const inflight = s.inflight ?? (s.inflight = new Map());
  const running = inflight.get(key);
  if (running) return running;

  const task = (async (): Promise<ListingMeta> => {
    const budgetMs = opts.budgetMs ?? (platform === "instagram" ? IG_BUDGET_MS : OVERALL_BUDGET_MS);
    const b = makeBudget(budgetMs);
    let meta: ListingMeta = { title: null, description: null, image: null };
    try {
      switch (platform) {
        case "instagram":
          meta = await fetchInstagram(identityUrl, href, b);
          break;
        case "tiktok":
          meta = await fetchTikTok(identityUrl, href, b);
          break;
        case "x":
          meta = await fetchX(identityUrl, href, b);
          break;
        case "linkedin":
          meta = await fetchLinkedIn(identityUrl, href, b);
          break;
        case "app":
          meta = await fetchApp(identityUrl, href, b);
          break;
        case "website":
          meta = await fetchWebsite(identityUrl, href, b);
          break;
      }
    } catch {
      meta = { title: null, description: null, image: null };
    }

    if (hasData(meta)) {
      cacheSet(key, meta);
      rememberGood(key, meta);
      void setMetaCached(platform, identityUrl, meta); // best-effort persist
      return meta;
    }
    // Live fetch found nothing — fall back to last known good data (memory
    // first, then the durable table), else negative-cache briefly so
    // re-pastes don't hammer a struggling platform.
    const good = state().lastGood?.get(key);
    if (good) return good;
    if (durable && (durable.title || durable.description || durable.image_url)) {
      const stale: ListingMeta = {
        title: durable.title,
        description: durable.description,
        image: durable.image_url,
      };
      rememberGood(key, stale);
      return stale; // stale but real — beats an empty card
    }
    cacheSet(key, null);
    return meta;
  })();

  inflight.set(key, task);
  return task.finally(() => inflight.delete(key));
}
