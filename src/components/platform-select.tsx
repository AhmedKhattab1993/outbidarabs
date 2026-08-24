"use client";

// Platform dropdown attached to the start of the claim input. It picks the
// platform a bare @handle resolves against; when a full link is pasted the
// parent auto-detects the platform and locks the control (title explains).

import { useEffect, useRef, useState } from "react";
import { PLATFORMS, platformLabel, type Platform } from "@/lib/platforms";
import type { Lang } from "@/lib/i18n";
import { PlatformIcon, PlatformBadge } from "@/components/platform-icon";

export function PlatformSelect({
  value,
  onChange,
  lang,
  disabled = false,
  autoDetected = false,
  autoTitle,
}: {
  value: Platform;
  onChange: (p: Platform) => void;
  lang: Lang;
  disabled?: boolean;
  autoDetected?: boolean;
  autoTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={platformLabel(value, lang)}
        title={autoDetected ? autoTitle : platformLabel(value, lang)}
        disabled={disabled}
        className="flex h-full cursor-pointer items-center gap-1.5 rounded-s-2xl border-e border-input px-2.5 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default md:px-3"
      >
        <PlatformBadge platform={value} className="size-6" />
        <span className="hidden text-xs font-bold whitespace-nowrap text-foreground md:inline">
          {platformLabel(value, lang)}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={platformLabel(value, lang)}
          className="absolute top-full z-50 mt-2 min-w-44 start-0 overflow-hidden rounded-xl border border-input bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              role="option"
              aria-selected={p === value}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-start text-xs font-bold text-popover-foreground transition-colors hover:bg-muted md:text-sm"
            >
              <PlatformIcon platform={p} className="size-4 shrink-0" />
              <span className="flex-1">{platformLabel(p, lang)}</span>
              {p === value && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5 shrink-0 text-primary"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
