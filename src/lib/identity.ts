// Identity handling: detect the platform from a submitted URL / @handle,
// normalize it into a canonical listing key per platform, strip tracking
// params, and reject forbidden inputs.

import {
  HANDLE_CANDIDATES,
  USERNAME_PATTERNS,
  type Platform,
} from "@/lib/platforms";

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

// Illegal content: narcotics, gambling, weapons, fraud, counterfeit, stolen
// goods/accounts. Blocked regardless of licensing (gambling is illegal or highly
// restricted across the target Arab markets; listing it = promotion).
const ILLEGAL_PATTERN =
  /\b(drugs?|narco|narcotics?|cocaine|heroin|crack|meth(?:amphetamine)?|khat|cannabis|weed4sale|darkweb|onion-market|casino|gambling|betting|sportsbook|bookmaker|poker|lottery|jackpot|roulette|craps|baccarat|slot-?machines?|online-?slots?|arms4sale|weapons?|gun4sale|rifle4sale|counterfeit|forged?(?:-| )?(?:documents?|ids?|passports?|licenses?|banknotes?|money)|carding|stolen(?:-| )?(?:accounts?|cards?)|ccdump|fullz|humantrafficking)\b/i;
const ILLEGAL_ARABIC = [
  "مخدرات", "حشيش", "بانجو", "أفيون", "افيون", "هيروين", "كوكايين", "ترامادول",
  "كبتاجون", "استروكس", "شابو", "كازينو", "قمار", "مقامرة", "مراهنة", "مراهنات",
  "يانصيب", "روليت", "لوتو", "سلاح للبيع", "أسلحة للبيع", "اسلحة للبيع",
  "تزوير", "عملة مزيفة", "حسابات مسروقة", "بطاقات مسروقة", "احتيال إلكتروني",
];

// Major gambling operators targeting the Arab market
const GAMBLING_HOSTS = [
  "1xbet.com", "bet365.com", "melbet.com", "linebet.com", "mostbet.com",
  "betway.com", "unibet.com", "bwin.com", "dafabet.com", "w88.com", "fun88.com",
  "stanleybet.com", "fonbet.com", "betfinal.com",
];

// Reserved path prefixes that are not profiles on each social platform.
const IG_RESERVED = new Set([
  "p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct",
  "about", "legal", "developer", "directory", "web", "challenge",
]);
const TIKTOK_RESERVED = new Set([
  "discover", "following", "upload", "foryou", "live", "video", "v", "trending",
  "music", "tag", "business", "creators", "safety", "about",
]);
const X_RESERVED = new Set([
  "home", "explore", "search", "notifications", "messages", "settings", "i",
  "intent", "has", "share", "compose", "login", "signup", "personalization",
]);

function hostMatches(host: string, target: string): boolean {
  return host === target || host.endsWith("." + target);
}

export type NormalizedIdentity = {
  ok: true;
  url: string;           // canonical key: platform-canonical URL, params stripped
  display_name: string;  // default title before smart-fetch
  href: string;          // where clicks go (clean canonical URL)
  platform: Platform;
};

export type IdentityError = {
  ok: false;
  reason: string;
  candidates?: Platform[]; // for "ambiguous": platforms the handle could be
};

/** Raw handle part of the input, or null when the input isn't a bare handle.
 *  A dotted bare word ("khaby.lame") is only treated as a handle when the
 *  user explicitly picked a handle platform — otherwise it stays a domain. */
function bareHandle(raw: string, platformHint?: Platform): string | null {
  if (raw.includes("/") || raw.includes(" ") || raw.includes("@", 1)) return null;
  const m = raw.match(/^@?([A-Za-z0-9._]{1,30})$/);
  if (!m) return null;
  if (!raw.startsWith("@") && raw.includes(".")) {
    return platformHint && HANDLE_CANDIDATES.includes(platformHint) ? m[1] : null;
  }
  return m[1];
}

export function normalizeIdentity(
  input: string,
  platformHint?: Platform
): NormalizedIdentity | IdentityError {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "empty" };

  // ── Bare @handle / username: needs a platform ──
  const handle = bareHandle(raw, platformHint);
  if (handle != null) {
    const reason = moderateText(handle);
    if (reason) return { ok: false, reason };
    const platform = HANDLE_CANDIDATES.includes(platformHint as never)
      ? platformHint!
      : null;
    if (!platform || !USERNAME_PATTERNS[platform].test(handle)) {
      const candidates = HANDLE_CANDIDATES.filter((p) => USERNAME_PATTERNS[p].test(handle));
      return { ok: false, reason: "ambiguous", candidates };
    }
    return socialIdentity(platform, handle);
  }

  // ── URL input ──
  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
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
  const segments = u.pathname.split("/").filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });

  // Forbidden: chat / invite links — exact host (or subdomain) matching only.
  for (const f of FORBIDDEN_HOSTS) {
    if (hostMatches(host, f)) return { ok: false, reason: "forbidden-chat" };
  }
  for (const { host: fh, prefix } of FORBIDDEN_HOST_PATHS) {
    if (hostMatches(host, fh) && u.pathname.toLowerCase().startsWith(prefix)) {
      return { ok: false, reason: "forbidden-chat" };
    }
  }
  for (const s of SHORTENER_HOSTS) {
    if (hostMatches(host, s)) return { ok: false, reason: "shortener" };
  }
  // TikTok share links (vm.tiktok.com/xxx) — ask for the full profile URL.
  if (host === "vm.tiktok.com" || host === "m.tiktok.com" || host === "vt.tiktok.com") {
    return { ok: false, reason: "tiktok-short" };
  }

  // Forbidden: NSFW / illegal keywords in the host or (decoded) path.
  const reason = moderateText(`${u.hostname}${decodePath(u.pathname)}`);
  if (reason) return { ok: false, reason };
  for (const g of GAMBLING_HOSTS) {
    if (hostMatches(host, g)) return { ok: false, reason: "illegal" };
  }

  // ── Platform canonicalization ──
  if (host === "instagram.com" || host === "instagr.am") {
    if (segments.length !== 1 || IG_RESERVED.has(segments[0].toLowerCase())) {
      return { ok: false, reason: "post-not-profile" };
    }
    if (!USERNAME_PATTERNS.instagram.test(segments[0])) return { ok: false, reason: "invalid" };
    return socialIdentity("instagram", segments[0]);
  }

  if (host === "tiktok.com") {
    if (segments.length !== 1 || TIKTOK_RESERVED.has(segments[0].toLowerCase())) {
      return { ok: false, reason: "post-not-profile" };
    }
    const username = segments[0].replace(/^@/, "");
    if (!username || !USERNAME_PATTERNS.tiktok.test(username)) return { ok: false, reason: "invalid" };
    return socialIdentity("tiktok", username);
  }

  if (host === "x.com" || host === "twitter.com" || host === "mobile.x.com") {
    if (segments.length !== 1 || X_RESERVED.has(segments[0].toLowerCase())) {
      return { ok: false, reason: "post-not-profile" };
    }
    if (!USERNAME_PATTERNS.x.test(segments[0])) return { ok: false, reason: "invalid" };
    return socialIdentity("x", segments[0]);
  }

  if (host === "linkedin.com") {
    if (segments[0]?.toLowerCase() !== "in" || !segments[1]) {
      return { ok: false, reason: "linkedin-profile" };
    }
    if (!USERNAME_PATTERNS.linkedin.test(segments[1])) return { ok: false, reason: "invalid" };
    return socialIdentity("linkedin", segments[1]);
  }

  if (host === "apps.apple.com" || host === "itunes.apple.com") {
    const idm = u.pathname.match(/\/id(\d+)/);
    if (!idm) return { ok: false, reason: "store-app" };
    const key = `https://apps.apple.com${u.pathname.replace(/\/$/, "").toLowerCase()}`;
    return {
      ok: true,
      url: key,
      display_name: `App Store · ${idm[1]}`,
      href: `https://apps.apple.com${u.pathname.replace(/\/$/, "")}`,
      platform: "app",
    };
  }

  if (host === "play.google.com") {
    const id = u.searchParams.get("id");
    if (!id || u.pathname !== "/store/apps/details") {
      return { ok: false, reason: "store-app" };
    }
    return {
      ok: true,
      url: `https://play.google.com/store/apps/details?id=${id.toLowerCase()}`,
      display_name: `Play Store · ${id.split(".").pop()}`,
      href: `https://play.google.com/store/apps/details?id=${id}`,
      platform: "app",
    };
  }

  // ── Generic website ──
  u.search = "";
  u.hash = "";
  const key = `${u.origin}${u.pathname === "/" ? "" : u.pathname}`.toLowerCase();
  const displayName = host.length > 40 ? host.slice(0, 40) : host;
  return {
    ok: true,
    url: key,
    display_name: displayName,
    href: u.toString(),
    platform: "website",
  };
}

/** Canonical identity for a handle-based social platform. */
function socialIdentity(platform: Platform, handleRaw: string): NormalizedIdentity {
  const handle = handleRaw.replace(/^@/, "").toLowerCase();
  switch (platform) {
    case "instagram":
      return {
        ok: true,
        url: `https://instagram.com/${handle}`,
        display_name: `@${handle}`,
        href: `https://www.instagram.com/${handle}/`,
        platform,
      };
    case "tiktok":
      return {
        ok: true,
        url: `https://tiktok.com/@${handle}`,
        display_name: `@${handle}`,
        href: `https://www.tiktok.com/@${handle}`,
        platform,
      };
    case "x":
      return {
        ok: true,
        url: `https://x.com/${handle}`,
        display_name: `@${handle}`,
        href: `https://x.com/${handle}`,
        platform,
      };
    case "linkedin":
      return {
        ok: true,
        url: `https://linkedin.com/in/${handle}`,
        display_name: `in/${handle}`,
        href: `https://www.linkedin.com/in/${handle}/`,
        platform,
      };
    default:
      // unreachable — only handle platforms call this
      return {
        ok: true,
        url: handle,
        display_name: handle,
        href: handle,
        platform: "website",
      };
  }
}

function decodePath(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

/** NSFW / illegal keyword moderation on a plain string (handle, host+path). */
function moderateText(s: string): string | null {
  if (NSFW_PATTERN.test(s)) return "nsfw";
  for (const p of NSFW_ARABIC) if (s.includes(p)) return "nsfw";
  if (ILLEGAL_PATTERN.test(s)) return "illegal";
  for (const p of ILLEGAL_ARABIC) if (s.includes(p)) return "illegal";
  return null;
}

export function identityErrorMessages(reason: string, lang: "ar" | "en"): string {
  const msgs: Record<string, { ar: string; en: string }> = {
    empty: { ar: "يرجى إدخال اسم المستخدم أو الرابط", en: "Please enter a username or URL" },
    invalid: { ar: "الرابط المدخل غير صالح", en: "Please enter a valid URL" },
    ambiguous: {
      ar: "يرجى تحديد المنصة: إنستغرام، تيك توك، أو إكس",
      en: "Please select the platform: Instagram, TikTok, or X",
    },
    "post-not-profile": {
      ar: "يرجى إدخال رابط الملف الشخصي/الحساب، وليس رابط منشور منفصل",
      en: "Please enter a profile link, not a post link",
    },
    "linkedin-profile": {
      ar: "يرجى إدخال رابط ملف شخصي بصيغة linkedin.com/in/username",
      en: "Enter a profile URL like linkedin.com/in/username",
    },
    "store-app": {
      ar: "يرجى إدخال رابط تطبيق صالح من App Store أو Google Play",
      en: "Enter a valid App Store or Google Play URL",
    },
    "tiktok-short": {
      ar: "الروابط المختصرة لتيك توك غير مدعومة — يرجى إدخال رابط الحساب الكامل",
      en: "Short TikTok links aren't supported — enter the full profile URL",
    },
    "forbidden-chat": {
      ar: "روابط المجموعات والمحادثات الخاصة غير مسموحة (واتساب، تيليجرام، ديسكورد وغيرها)",
      en: "Group and chat invite links are not allowed (WhatsApp, Telegram, Discord, etc.)",
    },
    shortener: {
      ar: "الروابط المختصرة غير مسموحة لضمان الشفافية والأمان",
      en: "Link shorteners are not allowed for transparency and security",
    },
    nsfw: {
      ar: "المحتوى الإباحي أو المخصص للبالغين غير مسموح به إطلاقاً",
      en: "Adult content is strictly not allowed",
    },
    illegal: {
      ar: "المحتوى والأنشطة غير القانونية محظورة بالكامل (مخدرات، قمار، أسلحة، احتيال)",
      en: "Illegal content and activities are strictly prohibited (drugs, gambling, weapons, fraud)",
    },
    "too-low": { ar: "الحد الأدنى للمزايدة هو $1", en: "Minimum bid is $1" },
    "over-max": { ar: "الحد الأقصى للمزايدة هو $999,999", en: "Maximum bid is $999,999" },
  };
  return (msgs[reason] ?? msgs.invalid)[lang];
}
