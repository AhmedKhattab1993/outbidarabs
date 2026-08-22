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

// Illegal content: narcotics, gambling, weapons, fraud, counterfeit, stolen
// goods/accounts. Blocked regardless of licensing (gambling is illegal or highly
// restricted across the target Arab markets; listing it = promotion).
// FP guards: "betting" yes but bare "bet"/"bets" no (bet.com = BET network;
// "betterhelp"/"alphabet" would trip); "lottery" yes, bare "lotto" no (Lotto
// sportswear; Arabic "لوتو" covers regional usage); bare "slots" no (scheduling
// apps) — only "slot-machines"/"online-slots"; "casino"/"poker"/"jackpot" are
// near-unambiguous at a word boundary (accepted risk). Known gap: concatenated
// compounds ("arabcasino.com", "888casino.com") evade \b — the brand list below
// plus manual takedown (listings.is_active = false) are the backstop.
const ILLEGAL_PATTERN =
  /\b(drugs?|narco|narcotics?|cocaine|heroin|crack|meth(?:amphetamine)?|khat|cannabis|weed4sale|darkweb|onion-market|casino|gambling|betting|sportsbook|bookmaker|poker|lottery|jackpot|roulette|craps|baccarat|slot-?machines?|online-?slots?|arms4sale|weapons?|gun4sale|rifle4sale|counterfeit|forged?(?:-| )?(?:documents?|ids?|passports?|licenses?|banknotes?|money)|carding|stolen(?:-| )?(?:accounts?|cards?)|ccdump|fullz|humantrafficking)\b/i;
const ILLEGAL_ARABIC = [
  "مخدرات", "حشيش", "بانجو", "أفيون", "افيون", "هيروين", "كوكايين", "ترامادول",
  "كبتاجون", "استروكس", "شابو", "كازينو", "قمار", "مقامرة", "مراهنة", "مراهنات",
  "يانصيب", "روليت", "لوتو", "سلاح للبيع", "أسلحة للبيع", "اسلحة للبيع",
  "تزوير", "عملة مزيفة", "حسابات مسروقة", "بطاقات مسروقة", "احتيال إلكتروني",
];

// Major gambling operators targeting the Arab market — exact host + subdomain
// matching via hostMatches(). The keyword patterns cannot catch these
// ("bet365"/"1xbet" are single words; \bbet\b is deliberately not in the
// pattern). This is a denylist, not moderation — extend as brands/mirrors appear;
// listings may also be removed manually (listings.is_active = false).
const GAMBLING_HOSTS = [
  "1xbet.com", "bet365.com", "melbet.com", "linebet.com", "mostbet.com",
  "betway.com", "unibet.com", "bwin.com", "dafabet.com", "w88.com", "fun88.com",
  "stanleybet.com", "fonbet.com", "betfinal.com",
];

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

  // Forbidden: NSFW / illegal keywords in the host or path. NOTE: URL.pathname
  // percent-encodes non-ASCII, so substring checks must run on the decoded
  // string (raw checkable would never match Arabic terms). decodeURIComponent
  // can throw on a literal stray `%` — fall back to the raw string then.
  const checkable = `${u.hostname}${u.pathname}`;
  let decoded = checkable;
  try {
    decoded = decodeURIComponent(checkable);
  } catch {
    /* literal % in the path — check the raw form */
  }
  if (NSFW_PATTERN.test(decoded)) return { ok: false, reason: "nsfw" };
  for (const p of NSFW_ARABIC) {
    if (decoded.includes(p)) return { ok: false, reason: "nsfw" };
  }

  // Forbidden: illegal content — gambling brand hosts first (keyword patterns
  // can't see "bet365"/"1xbet"), then keyword patterns on host + path.
  for (const g of GAMBLING_HOSTS) {
    if (hostMatches(host, g)) return { ok: false, reason: "illegal" };
  }
  if (ILLEGAL_PATTERN.test(decoded)) return { ok: false, reason: "illegal" };
  for (const p of ILLEGAL_ARABIC) {
    if (decoded.includes(p)) return { ok: false, reason: "illegal" };
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
    illegal: {
      ar: "المحتوى غير القانوني ممنوع (مخدرات، قمار، أسلحة، احتيال…)",
      en: "Illegal content is not allowed (drugs, gambling, weapons, fraud…)",
    },
    "too-low": { ar: "الحد الأدنى $1", en: "Minimum bid is $1" },
    "over-max": { ar: "الحد الأقصى $999,999", en: "Maximum bid is $999,999" },
  };
  return (msgs[reason] ?? msgs.invalid)[lang];
}
