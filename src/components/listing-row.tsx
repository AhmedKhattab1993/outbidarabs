"use client";

import type { Listing } from "@/lib/types";
import { useLang } from "@/lib/lang-context";
import { platformLabel } from "@/lib/platforms";
import { timeAgo, formatUsd } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { PlatformBadge } from "@/components/platform-icon";

export function ListingRow({
  listing,
  rank,
  isTop3,
  isTop10,
  separatorAfter,
}: {
  listing: Listing;
  rank: number; // global rank on the board
  isTop3: boolean;
  isTop10: boolean;
  separatorAfter?: { label: string; afterRank: number } | null;
}) {
  const { t, lang } = useLang();
  // Any bid above the current holder takes the rank → claim price = bid + $1.
  const claimPrice = listing.bid_amount + 1;
  const claim = () =>
    window.dispatchEvent(
      new CustomEvent("outbidarabs:claim", { detail: { amount: claimPrice } })
    );

  return (
    <>
      <div
        className={
          isTop3
            ? `group relative h-full my-1.5 rounded-xl border-2 px-2.5 md:my-3 md:rounded-2xl md:px-3.5 ${
                rank === 1 ? "border-primary bg-primary/22" : "border-primary/40 bg-primary/8"
              }`
            : "group relative h-full px-3 md:px-4"
        }
      >
        <a
          href={`/go/${listing.id}`}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="flex h-full items-center gap-2 py-2 transition-colors hover:text-primary md:gap-3 md:py-3"
        >
          <div className="flex w-10 shrink-0 flex-col items-center gap-1.5 md:w-auto md:flex-row md:gap-3">
            {isTop3 ? (
              <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary px-1.5 py-px text-xs font-semibold text-primary-foreground md:min-w-10 md:px-2 md:py-0.5 md:text-base">
                #{rank}
              </span>
            ) : (
              <span
                className={
                  "inline-flex min-w-7 items-center justify-center text-xs md:min-w-10 md:text-base " +
                  (isTop10 ? "font-medium text-muted-foreground" : "text-muted-foreground")
                }
              >
                #{rank}
              </span>
            )}
            <span className="relative shrink-0">
              <Avatar
                name={listing.display_name}
                url={listing.target_url || listing.url}
                src={listing.image_url}
                className="size-10 bg-card text-sm shadow-sm ring-1 ring-black/5 md:size-14 md:text-lg dark:ring-white/10"
              />
              <span className="absolute -bottom-0.5 -end-0.5 md:-bottom-1 md:-end-1">
                <PlatformBadge
                  platform={listing.platform}
                  className="size-4 md:size-5"
                  title={platformLabel(listing.platform, lang)}
                />
              </span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p
                dir="auto"
                className={
                  "min-w-0 flex-1 truncate text-sm md:text-base " +
                  (isTop3 ? "font-bold" : isTop10 ? "font-medium" : "font-normal")
                }
              >
                {listing.display_name}
              </p>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-primary md:text-base">
                {formatUsd(listing.bid_amount)}
              </p>
            </div>
            {listing.description && (
              <p
                dir="auto"
                className="min-w-0 text-xs text-muted-foreground/70 line-clamp-2 md:whitespace-normal md:text-sm"
              >
                {listing.description}
              </p>
            )}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] md:text-xs">
              <span className="text-muted-foreground/70">{timeAgo(listing.last_bid_at, t)}</span>
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                <span className="relative inline-flex size-1.5 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                </span>
                {t.clicks(listing.clicks.toLocaleString("en-US"))}
              </span>
            </p>
          </div>
        </a>
        {/* Touch claim action: the hover pill below needs a pointer, so on
            touch screens this quiet inline row is the visible affordance. */}
        <button
          type="button"
          onClick={claim}
          className="-mt-1 mb-1 flex min-h-10 w-fit cursor-pointer items-center gap-1 rounded-full ps-3 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3 shrink-0">
            <path
              d="M12 19V5M5 12l7-7 7 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t.claimShort} {formatUsd(claimPrice)}
        </button>
        <button
          type="button"
          onClick={claim}
          className="pointer-events-none absolute left-1/2 z-20 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-primary-foreground shadow-sm transition-opacity duration-150 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
        >
          {t.claimRankFor} {formatUsd(claimPrice)}
        </button>
      </div>
      {separatorAfter && separatorAfter.afterRank === rank && (
        <div role="separator" className="flex items-center gap-3 px-3 py-5 md:gap-4 md:px-4 md:py-7">
          <span className="h-0.5 flex-1 rounded-full bg-primary/30" />
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-primary uppercase md:px-3 md:text-xs">
            {separatorAfter.label} {separatorAfter.afterRank}
          </span>
          <span className="h-0.5 flex-1 rounded-full bg-primary/30" />
        </div>
      )}
    </>
  );
}
