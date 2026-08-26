// Platform model: the board is organized by platform (Instagram & TikTok
// first). Detection runs on raw user input; canonical identity keys are
// derived per platform in identity.ts.

export const PLATFORMS = [
  "instagram",
  "tiktok",
  "x",
  "linkedin",
  "website",
  "app",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export type PlatformFilter = Platform | "all";

export function isPlatform(v: string | null | undefined): v is Platform {
  return !!v && (PLATFORMS as readonly string[]).includes(v);
}

export function isPlatformFilter(v: string | null | undefined): v is PlatformFilter {
  return v === "all" || isPlatform(v);
}

export const PLATFORM_LABELS: Record<Platform, { ar: string; en: string }> = {
  instagram: { ar: "إنستجرام", en: "Instagram" },
  tiktok: { ar: "تيك توك", en: "TikTok" },
  x: { ar: "إكس", en: "X" },
  linkedin: { ar: "لينكدإن", en: "LinkedIn" },
  website: { ar: "موقع", en: "Website" },
  app: { ar: "تطبيق", en: "App" },
};

export function platformLabel(p: Platform, lang: "ar" | "en"): string {
  return PLATFORM_LABELS[p][lang];
}

// Username shapes accepted per platform (used when a bare @handle needs a
// platform to be resolved, and to validate profile URLs).
export const USERNAME_PATTERNS: Record<Platform, RegExp> = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  tiktok: /^[A-Za-z0-9._]{1,24}$/,
  x: /^[A-Za-z0-9_]{1,15}$/,
  linkedin: /^[A-Za-z0-9-]{3,100}$/,
  website: /.*/,
  app: /.*/,
};

// Bare @handle / username inputs are ambiguous between the handle-based
// platforms. URL-based platforms (LinkedIn, Website, App) need a full URL.
export const HANDLE_CANDIDATES: Platform[] = ["instagram", "tiktok", "x"];

export type Detection =
  | { kind: "platform"; platform: Platform }
  | { kind: "ambiguous" }
  | { kind: "none" };

/** Best-effort client+server detection from raw input (no normalization). */
export function detectPlatform(input: string): Detection {
  const raw = input.trim();
  if (!raw) return { kind: "none" };

  // Full URL → host-based detection
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : raw.includes(".") && !raw.includes(" ") ? `https://${raw}` : null;
    if (candidate) {
      const u = new URL(candidate);
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      if (host === "instagram.com" || host === "instagr.am") return { kind: "platform", platform: "instagram" };
      if (host === "tiktok.com") return { kind: "platform", platform: "tiktok" };
      if (host === "x.com" || host === "twitter.com" || host === "mobile.x.com") return { kind: "platform", platform: "x" };
      if (host === "linkedin.com") return { kind: "platform", platform: "linkedin" };
      if (host === "apps.apple.com" || host === "play.google.com" || host === "itunes.apple.com") return { kind: "platform", platform: "app" };
      // Any other absolute URL → website (final call happens in normalizeIdentity)
      if (/^https?:\/\//i.test(raw) || raw.includes("/")) {
        return { kind: "platform", platform: "website" };
      }
      // Bare domain ("example.com") or dotted word ("khaby.lame") — ambiguous
      // between "website" and "handle with dots"; normalizeIdentity resolves
      // it using the user's explicit dropdown choice, so don't pre-empt it.
      return { kind: "none" };
    }
  } catch {
    /* fall through */
  }

  // @handle or bare username → ambiguous between handle platforms
  const handle = raw.replace(/^@/, "");
  if (/^@?[A-Za-z0-9._]{1,30}$/.test(raw) && (raw.startsWith("@") || !raw.includes("."))) {
    const fits = HANDLE_CANDIDATES.filter((p) => USERNAME_PATTERNS[p].test(handle));
    if (fits.length > 0) return { kind: "ambiguous" };
  }
  return { kind: "none" };
}
