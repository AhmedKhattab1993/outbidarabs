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
//  - linkedin: page OG tags (usually login-walled → clean fallback)

import type { Platform } from "@/lib/platforms";
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
// Cap for any single HTTP request / curl invocation inside that budget.
const REQ_TIMEOUT_MS = 4000;
const FETCH_RETRIES = 1;      // one retry on 429/5xx/network errors
const RETRY_DELAY_MS = 500;
const CACHE_TTL_MS = 10 * 60_000;
// Failed fetches are remembered briefly so typing bursts don't hammer the
// upstream platform while the user edits the same handle — but short enough
// that an immediate re-paste can retry after a transient failure.
const NEG_CACHE_TTL_MS = 15_000;

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
function makeBudget(totalMs: number) {
  const end = Date.now() + totalMs;
  return {
    /** Returns milliseconds to spend, or 0 when the budget is exhausted. */
    take(cap: number): number {
      const ms = Math.min(cap, end - Date.now());
      return ms >= 400 ? Math.round(ms) : 0;
    },
  };
}
type Budget = ReturnType<typeof makeBudget>;

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
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/gi, "'")
    .trim();
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
  // Already locked out recently — don't touch the network at all.
  if (instagramCoolingDown()) return { title: null, description: null, image: null };
  // The web app's own profile endpoint (public app id). Node's fetch gets
  // 429'd by TLS fingerprint on datacenter IPs — race curl against plain
  // fetch across both API hosts; whichever answers first wins, and the
  // budget caps the whole stage so failures stay fast.
  const apiOf = (host: string) =>
    `https://${host}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const igHeaders = { "x-ig-app-id": "936619743392459", accept: "*/*" };
  // All upstream trips go through the shared pacer (≥1.5s apart) so bursts
  // don't trip Instagram's per-IP lockout on the datacenter egress; a
  // lockout payload aborts remaining tries immediately.
  let sawLimit = false;
  const apiTask = (raw: () => Promise<any | null>): (() => Promise<any | null>) =>
    // Cooldown check sits OUTSIDE the pacer so fully-skipped tries never
    // touch the chain; the inner check (before any I/O) aborts an already-
    // queued try without costing the followers their 1.5s slot.
    () =>
      instagramCoolingDown()
        ? Promise.resolve(null)
        : paceInstagramUpstream(async () => {
            if (instagramCoolingDown()) return PACE_SKIP;
            const r = await raw();
            if ((r && igSaysLimited(r.json)) || isTransient(r?.status ?? 0)) {
              sawLimit = true;
              markInstagramLocked();
              return PACE_SKIP;
            }
            const user = r?.json?.data?.user;
            return user ? r : null;
          }).then((v) => (v === PACE_SKIP ? null : v));
  const j = await raceSuccess([
    apiTask(() => curlJson(apiOf("i.instagram.com"), igHeaders, b.take(4000))),
    apiTask(() => curlJson(apiOf("www.instagram.com"), igHeaders, b.take(3000))),
    apiTask(() => fetchJson(apiOf("i.instagram.com"), igHeaders, b)),
    apiTask(() => fetchJson(apiOf("www.instagram.com"), igHeaders, b)),
  ]);
  const user = j?.data?.user;
  if (user) {
    return {
      title: clampTitle(user.full_name || null),
      description: clampDesc(user.biography ?? null),
      image: user.profile_pic_url ?? null,
    };
  }
  // Locked out: the OG fallback would land on the login wall too — bail out
  // now so failed pastes answer fast until the lockout clears.
  if (sawLimit || instagramCoolingDown()) {
    return { title: null, description: null, image: null };
  }
  // Fallback: profile page OG tags (login-walled pages serve generic
  // branding → sanitized below into a clean no-data result).
  const base = `https://www.instagram.com/${username}/`;
  const html = await fetchHtml(base, undefined, b);
  if (!html) return { title: null, description: null, image: null };
  // Login redirect = page-level gate. Short cooldown so the next pastes skip
  // straight to fallback instead of re-hitting the wall.
  const title = htmlMeta(html, "og:title");
  if (!title && /accounts\/(login|challenge)/.test(html.slice(0, 5000))) {
    markInstagramLocked(45_000);
    return { title: null, description: null, image: null };
  }
  const desc = htmlMeta(html, "og:description");
  const image = resolveUrl(htmlMeta(html, "og:image"), base);
  return {
    title: title && !/^instagram(\.com)?$/i.test(title) ? clampTitle(title) : null,
    description:
      desc && !/^instagram(\.com)?$/i.test(desc) && !/sign ?up to see|log ?in to see/i.test(desc)
        ? clampDesc(desc)
        : null,
    image: image && !/rsrc\.php/.test(image) ? image : null,
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
export async function fetchListingMeta(
  platform: Platform,
  identityUrl: string,
  href: string
): Promise<ListingMeta> {
  const key = `${platform}:${identityUrl}`;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit ?? { title: null, description: null, image: null };

  const s = state();
  const inflight = s.inflight ?? (s.inflight = new Map());
  const running = inflight.get(key);
  if (running) return running;

  const task = (async (): Promise<ListingMeta> => {
    const b = makeBudget(OVERALL_BUDGET_MS);
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
      return meta;
    }
    // Live fetch found nothing — fall back to last known good data, else
    // negative-cache briefly so re-pastes don't hammer a struggling platform.
    const good = state().lastGood?.get(key);
    if (good) return good;
    cacheSet(key, null);
    return meta;
  })();

  inflight.set(key, task);
  return task.finally(() => inflight.delete(key));
}
