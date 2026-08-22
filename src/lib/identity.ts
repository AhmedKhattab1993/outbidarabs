// Identity handling: normalize a submitted URL / @handle into a canonical
// listing key, strip tracking params, and reject forbidden inputs.

// Hosts where every path is forbidden (chat / invite platforms).
const FORBIDDEN_HOSTS = [
  "t.me", "telegram.me", "telegram.dog", "joinchat.com",
  "chat.whatsapp.com", "wa.me", "api.whatsapp.com",
  "discord.gg", "m.me", "signal.me", "signal.group",
  "messenger.com",
];

// Hosts where only specific paths are forbidden.
const FORBIDDEN_HOST_PATHS: Array<{ host: string; prefix: string }> = [
  { host: "discord.com", prefix: "/invite" },
  { host: "discordapp.com", prefix: "/invite" },
];

const SHORTENER_HOSTS = [
  "bit.ly", "tinyurl.com", "is.gd", "cutt.ly", "rb.gy", "shorturl.at",
  "t.co", "goo.gl", "ow.ly", "buff.ly", "rebrand.ly", "tiny.cc", "shorte.st",
  "adf.ly", "bit.do", "lnkd.in", "s.id", "linktr.ee",
];

// Latin NSFW terms are matched on word boundaries so innocent substrings
// ("sussex", "essex", "brighton") don't trip; Arabic terms use substring match.
const NSFW_PATTERN =
  /\b(porn|xxx|nsfw|sex|escort|camgirl|onlyfans|hentai|adult|18\+)\b/i;
const NSFW_ARABIC = ["نياكة", "سكس", "إباحي", "اباحي", "بورن"];

function hostMatches(host: string, target: string): boolean {
  return host === target || host.endsWith("." + target);
}

export type NormalizedIdentity = {
  ok: true;
  url: string;          // canonical key: origin + path (+ play-store id), no tracking params
  display_name: string; // shown on the board
  href: string;         // where clicks go (same param rules as the key)
};

export type IdentityError = {
  ok: false;
  reason: string;
};

export function normalizeIdentity(input: string): NormalizedIdentity | IdentityError {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "empty" };

  // @handle → X profile
  const handleMatch = raw.match(/^@?([A-Za-z0-9_]{1,15})$/);
  if (handleMatch && (raw.startsWith("@") || /^[A-Za-z0-9_]+$/.test(raw)) && raw.includes("@")) {
    const handle = handleMatch[1];
    return {
      ok: true,
      url: `https://x.com/${handle.toLowerCase()}`,
      display_name: `@${handle}`,
      href: `https://x.com/${handle}`,
    };
  }

  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    // Arabic domains (IDN) and regular hosts both work this way
    if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(candidate) || /[\u0600-\u06FF]/.test(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return { ok: false, reason: "invalid" };
    }
  }

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "invalid" };
  if (!u.hostname.includes(".")) return { ok: false, reason: "invalid" };

  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  // Forbidden: chat / invite links — exact host (or subdomain) matching only,
  // so e.g. about.me or xt.me don't false-positive.
  for (const f of FORBIDDEN_HOSTS) {
    if (hostMatches(host, f)) return { ok: false, reason: "forbidden-chat" };
  }
  for (const { host: fh, prefix } of FORBIDDEN_HOST_PATHS) {
    if (hostMatches(host, fh) && u.pathname.toLowerCase().startsWith(prefix)) {
      return { ok: false, reason: "forbidden-chat" };
    }
  }

  // Forbidden: shorteners
  for (const s of SHORTENER_HOSTS) {
    if (hostMatches(host, s)) return { ok: false, reason: "shortener" };
  }

  // Forbidden: NSFW keywords in the host or path
  const checkable = `${u.hostname}${u.pathname}`;
  if (NSFW_PATTERN.test(decodeURIComponent(checkable))) return { ok: false, reason: "nsfw" };
  for (const p of NSFW_ARABIC) {
    if (checkable.includes(p)) return { ok: false, reason: "nsfw" };
  }

  // Query parameters are stripped from listing links (affiliate/referral/tracking
  // won't work). Exception: the Play Store `id` param — it identifies the app,
  // so different apps don't share a bid.
  const playId = host === "play.google.com" ? u.searchParams.get("id") : null;
  u.search = "";
  u.hash = "";
  if (playId) u.searchParams.set("id", playId);

  const key = `${u.origin}${u.pathname === "/" ? "" : u.pathname}${
    playId ? `?id=${playId}` : ""
  }`.toLowerCase();
  const href = u.toString();

  let displayName = host;
  // Platform display names
  if (host === "x.com" || host === "twitter.com") {
    const handle = u.pathname.replace(/^\//, "").split("/")[0];
    if (handle) displayName = `@${handle} on X`;
  } else if (host.endsWith("apps.apple.com")) {
    displayName = "App Store";
    const m = u.pathname.match(/\/id(\d+)/);
    if (m) displayName = `App Store · ${m[1]}`;
  } else if (host === "play.google.com") {
    displayName = "Play Store";
    const id = u.searchParams.get("id");
    if (id) displayName = `Play Store · ${id.split(".").pop()}`;
  } else if (host === "github.com") {
    const parts = u.pathname.replace(/^\//, "").split("/");
    if (parts[0]) displayName = parts[1] ? `${parts[0]}/${parts[1]} · GitHub` : `${parts[0]} · GitHub`;
  }
  if (displayName.length > 40) displayName = host;

  return {
    ok: true,
    url: key,
    display_name: displayName,
    href,
  };
}

export function identityErrorMessages(reason: string, lang: "ar" | "en"): string {
  const msgs: Record<string, { ar: string; en: string }> = {
    empty: { ar: "أدخل رابطاً أو معرّفاً", en: "Enter a URL or @handle" },
    invalid: { ar: "رابط غير صالح", en: "Invalid URL" },
    "forbidden-chat": {
      ar: "روابط المجموعات والدعوات ممنوعة (تيليجرام، واتساب، ديسكورد…)",
      en: "Chat and invite links are not allowed (Telegram, WhatsApp, Discord…)",
    },
    shortener: { ar: "روابط التقصير ممنوعة", en: "Link shorteners are not allowed" },
    nsfw: { ar: "المحتوى للبالغين ممنوع", en: "Adult content is not allowed" },
    "too-low": { ar: "الحد الأدنى $1", en: "Minimum bid is $1" },
    "over-max": { ar: "الحد الأقصى $999,999", en: "Maximum bid is $999,999" },
  };
  return (msgs[reason] ?? msgs.invalid)[lang];
}
