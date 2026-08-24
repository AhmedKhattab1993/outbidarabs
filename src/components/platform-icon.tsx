"use client";

// Platform icons: lucide-style stroke glyphs + a colored badge variant used
// on listing avatars and the preview card.

import type { Platform } from "@/lib/platforms";

function Glyph({ platform }: { platform: Platform }) {
  switch (platform) {
    case "instagram":
      return (
        <>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
          <circle cx="12" cy="12" r="4.25" />
          <circle cx="17.4" cy="6.6" r="0.5" fill="currentColor" stroke="none" />
          <circle cx="17.4" cy="6.6" r="1.1" />
        </>
      );
    case "tiktok":
      return (
        <>
          <path d="M9.5 18.2V5.2l10.5-1.9v10.4" />
          <circle cx="6.6" cy="18.2" r="2.9" />
          <circle cx="17.1" cy="15.2" r="2.9" />
        </>
      );
    case "x":
      return (
        <>
          <path d="M4 4l16 16" />
          <path d="M20 4L4 20" />
        </>
      );
    case "linkedin":
      return (
        <>
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4V8h4v1a6 6 0 0 1 2-1z" />
          <rect x="2" y="9" width="4" height="12" />
          <circle cx="4" cy="4" r="2" />
        </>
      );
    case "app":
      return (
        <>
          <rect x="6.5" y="2" width="11" height="20" rx="2.5" />
          <path d="M11 18.5h2" />
        </>
      );
    case "website":
    default:
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <ellipse cx="12" cy="12" rx="4" ry="10" />
          <path d="M2 12h20" />
        </>
      );
  }
}

/** Inline platform glyph (uses currentColor). */
export function PlatformIcon({
  platform,
  className = "size-4",
  strokeWidth = 1.8,
}: {
  platform: Platform;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Glyph platform={platform} />
    </svg>
  );
}

// Brand colors for the badge variant (recognizable at small sizes).
// TikTok is special-cased below: real brand mark is a white note with
// cyan/red duotone shadows on black, not a solid fill.
const BADGE_COLORS: Record<Platform, string> = {
  instagram: "#d6336c",
  tiktok: "#000000",
  x: "#0f0f0f",
  linkedin: "#0a66c2",
  website: "#6b7280",
  app: "#0f9d58",
};

const TIKTOK_CYAN = "#25f4ee";
const TIKTOK_RED = "#fe2c55";

/** TikTok duotone note: cyan + red offset shadows under a white note. */
function TikTokDuoGlyph() {
  const note = (
    <>
      <path d="M9.5 18.2V5.2l10.5-1.9v10.4" />
      <circle cx="6.6" cy="18.2" r="2.9" />
      <circle cx="17.1" cy="15.2" r="2.9" />
    </>
  );
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="size-[62%]"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g stroke={TIKTOK_CYAN} transform="translate(-0.8 -0.8)">
        {note}
      </g>
      <g stroke={TIKTOK_RED} transform="translate(0.8 0.8)">
        {note}
      </g>
      <g stroke="#ffffff">{note}</g>
    </svg>
  );
}

/** Small rounded-square badge with the platform glyph — sits on avatars/cards. */
export function PlatformBadge({
  platform,
  className = "",
  title,
}: {
  platform: Platform;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={
        "inline-flex items-center justify-center rounded-[5px] text-white shadow-sm ring-1 ring-black/10 dark:ring-white/10 " +
        className
      }
      style={{ backgroundColor: BADGE_COLORS[platform] }}
    >
      {platform === "tiktok" ? (
        <TikTokDuoGlyph />
      ) : (
        <PlatformIcon platform={platform} className="size-[62%] text-white" strokeWidth={2.2} />
      )}
    </span>
  );
}
