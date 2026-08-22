"use client";

// Platform filter pills: All | Instagram | TikTok | X | LinkedIn | Website | App
// Horizontally scrollable on mobile, no page wrap.

import { PLATFORMS, platformLabel, type PlatformFilter } from "@/lib/platforms";
import { useLang } from "@/lib/lang-context";
import { PlatformIcon } from "@/components/platform-icon";

export function PlatformFilter({
  active,
  onChange,
}: {
  active: PlatformFilter;
  onChange: (p: PlatformFilter) => void;
}) {
  const { t, lang } = useLang();

  const pill = (value: PlatformFilter, label: string, icon?: React.ReactNode) => (
    <button
      key={value}
      type="button"
      aria-pressed={active === value}
      onClick={() => onChange(value)}
      className={
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 " +
        (active === value
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground")
      }
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      role="tablist"
      aria-label={lang === "ar" ? "تصفية حسب المنصة" : "Filter by platform"}
      className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max items-center gap-2 mx-auto">
        {pill("all", t.filterAll)}
        {PLATFORMS.map((p) =>
          pill(p, platformLabel(p, lang), <PlatformIcon key={p} platform={p} className="size-3.5" />)
        )}
      </div>
    </div>
  );
}
