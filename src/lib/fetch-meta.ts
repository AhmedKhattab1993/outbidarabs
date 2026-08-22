// Smart fetching: best-effort public data for the preview card.
// Never throws, never blocks longer than FETCH_TIMEOUT_MS, caches successes.
//
// Coverage by platform (spec phases):
//  - website: Open Graph image/title/description + favicon (solid)
//  - app:     iTunes Lookup API (App Store) / page OG tags (Play Store)
//  - x:       publish.twitter.com oEmbed (display name)
//  - tiktok:  tiktok.com oEmbed (nickname, avatar)
//  - instagram: web_profile_info endpoint + page OG tags (best effort)
//  - linkedin: page OG tags (usually login-walled → clean fallback)

import type { Platform } from "@/lib/platforms";

export type ListingMeta = {
  title: string | null;       // full name / app name / site title
  description: string | null; // bio / headline / og:description (≤150 chars)
  image: string | null;       // profile picture / app icon / og:image
};

const FETCH_TIMEOUT_MS = 4500;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 300;

const UA =
  "Mozilla/5.0 (compatible; outbidarabs/2.0; +https://outbidarabs.lol) AppleWebKit/537.36";

type CacheEntry = { expires: number; value: ListingMeta };
const cacheStore = globalThis as unknown as {
  __metaCache?: Map<string, CacheEntry>;
};
function cache(): Map<string, CacheEntry> {
  if (!cacheStore.__metaCache) cacheStore.__metaCache = new Map();
  return cacheStore.__metaCache;
}

function cacheGet(key: string): ListingMeta | null {
  const hit = cache().get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache().delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key: string, value: ListingMeta): void {
  const c = cache();
  if (c.size >= CACHE_MAX) {
    // drop the oldest entry (Map preserves insertion order)
    c.delete(c.keys().next().value as string);
  }
  c.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
}

async function fetchWithTimeout(url: string, headers?: Record<string, string>) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": UA, ...(headers ?? {}) },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<any | null> {
  try {
    const res = await fetchWithTimeout(url, headers);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    // Some pages (Google Play) inline ~1MB of JSON before the og: tags.
    return (await res.text()).slice(0, 2_000_000);
  } catch {
    return null;
  }
}

function htmlMeta(html: string, prop: string): string | null {
  const m = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']{2,600})["']`, "i")
  );
  if (m) return decodeHtmlEntities(m[1]);
  // reversed attribute order (content before property)
  const m2 = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']{2,600})["'][^>]+(?:property|name)=["']${prop}["']`, "i")
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

// ── Platform fetchers ──────────────────────────────────────

async function fetchInstagram(identityUrl: string): Promise<ListingMeta> {
  const username = handleOf(identityUrl);
  // Phase 3 best-effort: the web app's own profile endpoint (public app id).
  const j = await fetchJson(
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    { "x-ig-app-id": "936619743392459", accept: "*/*" }
  );
  const user = j?.data?.user;
  if (user) {
    return {
      title: clampTitle(user.full_name || null),
      description: clampDesc(user.biography ?? null),
      image: user.profile_pic_url ?? null,
    };
  }
  // Fallback: profile page OG tags.
  const html = await fetchHtml(`https://www.instagram.com/${username}/`);
  if (!html) return { title: null, description: null, image: null };
  const title = htmlMeta(html, "og:title");
  const desc = htmlMeta(html, "og:description");
  const image = resolveUrl(htmlMeta(html, "og:image"), `https://www.instagram.com/${username}/`);
  return {
    // Login-walled pages serve generic branding, not profile data — treat as
    // no data so the UI falls back to the platform icon + handle.
    title: title && !/^instagram(\.com)?$/i.test(title) ? clampTitle(title) : null,
    description:
      desc && !/^instagram(\.com)?$/i.test(desc) && !/sign ?up to see|log ?in to see/i.test(desc)
        ? clampDesc(desc)
        : null,
    image: image && !/rsrc\.php/.test(image) ? image : null,
  };
}

async function fetchTikTok(identityUrl: string): Promise<ListingMeta> {
  const username = handleOf(identityUrl);
  // Public oEmbed: returns the nickname, avatar and a title for profiles.
  const j = await fetchJson(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${username}`)}`
  );
  if (j?.author_name || j?.thumbnail_url) {
    return {
      title: clampTitle(j.author_name ?? null),
      description: null,
      image: resolveUrl(j.thumbnail_url ?? null, "https://www.tiktok.com/"),
    };
  }
  const html = await fetchHtml(`https://www.tiktok.com/@${username}`);
  if (!html) return { title: null, description: null, image: null };
  return {
    title: clampTitle(htmlMeta(html, "og:title")),
    description: clampDesc(htmlMeta(html, "og:description")),
    image: resolveUrl(htmlMeta(html, "og:image"), "https://www.tiktok.com/"),
  };
}

async function fetchX(identityUrl: string): Promise<ListingMeta> {
  const username = handleOf(identityUrl);
  // Public oEmbed: author_name carries the display name for profile URLs.
  const j = await fetchJson(
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://x.com/${username}`)}`
  );
  return {
    title: clampTitle(j?.author_name ?? null),
    description: null,
    image: null,
  };
}

async function fetchLinkedIn(href: string): Promise<ListingMeta> {
  // Usually login-walled; try OG tags once and fall back cleanly.
  const html = await fetchHtml(href);
  if (!html) return { title: null, description: null, image: null };
  return {
    title: clampTitle(htmlMeta(html, "og:title")),
    description: clampDesc(htmlMeta(html, "og:description") ?? htmlMeta(html, "description")),
    image: resolveUrl(htmlMeta(html, "og:image"), href),
  };
}

async function fetchWebsite(href: string): Promise<ListingMeta> {
  const html = await fetchHtml(href);
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

async function fetchApp(identityUrl: string, href: string): Promise<ListingMeta> {
  if (identityUrl.startsWith("https://apps.apple.com")) {
    const id = identityUrl.match(/\/id(\d+)/)?.[1];
    if (!id) return { title: null, description: null, image: null };
    const country = href.match(/apps\.apple\.com\/([a-z]{2})\//i)?.[1] ?? "us";
    const j = await fetchJson(
      `https://itunes.apple.com/lookup?id=${id}&country=${country}`
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
    const html = await fetchHtml(href);
    if (!html) return { title: null, description: null, image: null };
    return {
      title: clampTitle(htmlMeta(html, "og:title")),
      description: clampDesc(htmlMeta(html, "og:description")),
      image: resolveUrl(htmlMeta(html, "og:image"), href),
    };
  }
  // Google Play: page OG tags (og:image = app icon, og:title = app name)
  const html = await fetchHtml(href);
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

/** Entry point: platform-aware fetch with caching. Never throws. */
export async function fetchListingMeta(
  platform: Platform,
  identityUrl: string,
  href: string
): Promise<ListingMeta> {
  const key = `${platform}:${identityUrl}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  let meta: ListingMeta = { title: null, description: null, image: null };
  try {
    switch (platform) {
      case "instagram":
        meta = await fetchInstagram(identityUrl);
        break;
      case "tiktok":
        meta = await fetchTikTok(identityUrl);
        break;
      case "x":
        meta = await fetchX(identityUrl);
        break;
      case "linkedin":
        meta = await fetchLinkedIn(href);
        break;
      case "app":
        meta = await fetchApp(identityUrl, href);
        break;
      case "website":
        meta = await fetchWebsite(href);
        break;
    }
  } catch {
    meta = { title: null, description: null, image: null };
  }

  // Cache only real successes so failures retry next time.
  if (meta.title || meta.description || meta.image) cacheSet(key, meta);
  return meta;
}
