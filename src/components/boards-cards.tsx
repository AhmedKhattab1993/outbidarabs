"use client";

import { useState } from "react";
import type { ActivityItem, TrendingItem } from "@/lib/types";
import { useLang } from "@/lib/lang-context";
import { timeAgo } from "@/lib/format";
import { Avatar } from "@/components/avatar";

function ShowMore({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div className={open ? "" : "max-h-16 overflow-hidden md:max-h-none md:overflow-visible"}>
        {children}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-11 items-end justify-center pb-1 md:hidden">
        {!open && <div className="absolute inset-0 bg-gradient-to-t from-card from-20% via-card/80 to-transparent" />}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="pointer-events-auto relative z-10 inline-flex h-6 items-center justify-center gap-1 rounded-full border border-border bg-card px-2 text-xs font-bold transition-colors hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
        >
          {open ? "−" : "+"}
        </button>
      </div>
    </div>
  );
}

export function TrendingCard({ items }: { items: TrendingItem[] }) {
  const { t } = useLang();
  return (
    <section className="flex h-full flex-col rounded-2xl bg-card px-4 pt-3.5 pb-1 shadow-[0_12px_50px_rgba(40,38,36,0.08)] md:px-5 md:pt-4">
      <h2 className="mb-1 text-sm font-semibold tracking-[-0.02em]">{t.trending}</h2>
      <div className="flex min-h-0 flex-1 flex-col">
        <ShowMore>
          <ul className="flex flex-1 flex-col">
            {items.map((item, i) => (
              <li key={item.id} className={i === 0 ? "" : "border-t"}>
                <a
                  href={`/go/${item.id}`}
                  target="_blank"
                  rel="sponsored noopener noreferrer"
                  className="flex items-center gap-2 py-1.5 text-xs"
                >
                  <Avatar name={item.display_name} url={item.url} className="size-5 text-[10px]" />
                  <p dir="auto" className="min-w-0 flex-1 truncate font-semibold">{item.display_name}</p>
                  <span className="shrink-0 text-muted-foreground">
                    {item.clicks_per_hour.toLocaleString("en-US")} {t.clicksPerHour}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </ShowMore>
      </div>
    </section>
  );
}

export function ActivityCard({ items }: { items: ActivityItem[] }) {
  const { t } = useLang();
  return (
    <section className="flex h-full flex-col rounded-2xl bg-card px-4 pt-3.5 pb-1 shadow-[0_12px_50px_rgba(40,38,36,0.08)] md:px-5 md:pt-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold tracking-[-0.02em]">
        <span className="relative inline-flex size-1.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </span>
        {t.latestActivity}
      </h2>
      <div className="flex min-h-0 flex-1 flex-col">
        <ShowMore>
          <ul className="flex flex-1 flex-col">
            {items.map((item, i) => (
              <li key={item.id} className={i === 0 ? "" : "border-t"}>
                <span className="flex items-center gap-2 py-1.5 text-xs">
                  <Avatar name={item.display_name} url={item.target_url} src={item.image_url} className="size-5 text-[10px]" />
                  <p dir="auto" className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{item.display_name}</span>{" "}
                    <span className="text-muted-foreground">
                      {t.at} #{item.rank} · ${item.amount.toLocaleString("en-US")}
                    </span>
                  </p>
                  <span className="shrink-0 text-muted-foreground">
                    {timeAgo(item.created_at, t)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </ShowMore>
      </div>
    </section>
  );
}
