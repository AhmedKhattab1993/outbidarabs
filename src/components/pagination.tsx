"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/lib/lang-context";
import { PER_PAGE } from "@/lib/i18n";

export function Pagination({
  page,
  totalPages,
  total,
  onRefresh,
}: {
  page: number;
  totalPages: number;
  total: number;
  onRefresh?: () => void;
}) {
  const { t } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();

  const go = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`/?${params.toString()}#leaderboard`);
  };

  const pages: Array<number | "…"> = [];
  const push = (v: number | "…") => pages.push(v);
  const add = (v: number) => {
    if (!pages.includes(v)) push(v);
  };
  add(1);
  if (page > 3) push("…");
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) add(p);
  if (page < totalPages - 2) push("…");
  if (totalPages > 1) add(totalPages);

  if (totalPages <= 1 && total <= 0) return null;

  const from = total > 0 ? (page - 1) * PER_PAGE + 1 : 0;
  const to = Math.min(total, page * PER_PAGE);

  return (
    <nav aria-label={t.navLeaderboard} className="mt-5 flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:gap-x-4">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          className="flex size-10 cursor-pointer items-center justify-center text-primary transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground/40 disabled:hover:text-muted-foreground/40"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-5 rtl:-scale-x-100">
            <path
              d="M15 6C15 6 9.00001 10.4189 9 12C8.99999 13.5812 15 18 15 18"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="flex size-10 items-center justify-center text-sm text-muted-foreground" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              onClick={() => go(p)}
              className={
                "flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-full px-1.5 text-sm font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none " +
                (p === page
                  ? "bg-primary text-primary-foreground"
                  : "text-primary hover:bg-primary/10")
              }
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => go(page + 1)}
          className="flex size-10 cursor-pointer items-center justify-center text-primary transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground/40 disabled:hover:text-muted-foreground/40"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-5 rtl:-scale-x-100">
            <path
              d="M9 6C9 6 14.9999 10.4189 15 12C15.0001 13.5812 9 18 9 18"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </button>
      </div>
      {total > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {t.ofCount(from, to, total)}
        </p>
      )}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="mt-1 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="size-3.5"
          >
            <path
              d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          {t.refresh}
        </button>
      )}
    </nav>
  );
}
