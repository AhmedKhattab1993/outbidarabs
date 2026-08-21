// Identity handling: normalize a submitted URL / @handle into a canonical
// listing key, strip tracking params, and reject forbidden inputs.

const TRACKING_PARAM_PREFIXES = ["utm_", "fb_", "gclid", "mc_", "ref", "affiliate", "aff", "igshid", "ttclid", "s", "source"];

const FORBIDDEN_HOSTS = [
  "t.me", "telegram.me", "telegram.dog", "joinchat.com",
  "chat.whatsapp.com", "wa.me", "api.whatsapp.com",
  "discord.gg", "discord.com/invite", "discordapp.com/invite",
  "m.me", "messenger.com/t",
  "signal.me", "signal.group",
];

const SHORTENER_HOSTS = [
  "bit.ly", "tinyurl.com", "is.gd", "cutt.ly", "rb.gy", "shorturl.at",
  "t.co", "goo.gl", "ow.ly", "buff.ly", "rebrand.ly", "tiny.cc", "shorte.st",
  "adf.ly", "bit.do", "lnkd.in", "s.id", "linktr.ee",
];

const NSFW_PATTERNS = [
  "porn", "xxx", "nsfw", "sex", "escort", "camgirl", "onlyfans", "hentai",
  "adult", "نياكة", "سكس", "إباحي", "اباحي", "بورن",
];

export type NormalizedIdentity = {
  ok: true;
  url: string;          // canonical key, no tracking params
  display_name: string; // shown on the board
  href: string;         // where clicks go
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
      url: `https://x.com/${handle}`,
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

  // Forbidden: chat / invite links
  for (const f of FORBIDDEN_HOSTS) {
    if (host === f || u.href.toLowerCase().includes(f)) {
      return { ok: false, reason: "forbidden-chat" };
    }
  }

  // Forbidden: shorteners
  for (const s of SHORTENER_HOSTS) {
    if (host === s) return { ok: false, reason: "shortener" };
  }

  // Forbidden: NSFW keywords anywhere in the URL
  const lower = u.href.toLowerCase();
  for (const p of NSFW_PATTERNS) {
    if (lower.includes(p)) return { ok: false, reason: "nsfw" };
  }

  // Strip tracking params: drop known tracking keys, keep functional paths
  // (App Store / Play Store / GitHub are keyed by path).
  const params = [...u.searchParams.entries()];
  u.search = "";
  const kept = params.filter(
    ([k]) => !TRACKING_PARAM_PREFIXES.some((p) => k.toLowerCase().startsWith(p))
  );
  if (kept.length) for (const [k, v] of kept) u.searchParams.append(k, v);
  u.hash = "";

  // Canonical key: protocol + host + path (params stripped for identity),
  // but keep the cleaned params on the click-through href.
  const cleanParams = [...u.searchParams.entries()];
  const key = `${u.origin}${u.pathname === "/" ? "" : u.pathname}`.toLowerCase();
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
  } else if (host.endsWith("play.google.com")) {
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
  };
  return (msgs[reason] ?? msgs.invalid)[lang];
}
