"use client";

import { useEffect, useState } from "react";
import { avatarInitial } from "@/lib/format";

function faviconFor(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
  } catch {
    return null;
  }
}

/**
 * Listing avatar: og:image captured at submission → favicon → initial letter.
 * Circular, like the reference board.
 */
export function Avatar({
  name,
  url,
  src,
  className = "",
}: {
  name: string;
  url?: string | null;
  src?: string | null;
  className?: string;
}) {
  // Fallback chain: og:image (if any) → favicon (if any) → letter
  const chain = [src, faviconFor(url)].filter(Boolean) as string[];
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [src, url, chain.length]);

  const current = chain[stage] ?? null;

  return (
    <span
      className={
        "flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground " +
        className
      }
    >
      {current ? (
        <img
          src={current}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="size-full object-contain"
          onError={() => setStage((s) => s + 1)}
        />
      ) : (
        avatarInitial(name)
      )}
    </span>
  );
}
