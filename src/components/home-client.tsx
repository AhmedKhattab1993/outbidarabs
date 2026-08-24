"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ActivityItem, LeaderboardPage, Listing, SiteStats, TrendingItem } from "@/lib/types";
import { useLang } from "@/lib/lang-context";
import { PER_PAGE } from "@/lib/i18n";
import type { PlatformFilter } from "@/lib/platforms";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OnlinePill } from "@/components/online-pill";
import { ClaimForm } from "@/components/claim-form";
import { PlatformFilter as PlatformFilterPills } from "@/components/platform-filter";
import { TrendingCard, ActivityCard } from "@/components/boards-cards";
import { ListingRow } from "@/components/listing-row";
import { Pagination } from "@/components/pagination";
import { EarningsCard } from "@/components/earnings-card";

type InitialData = {
  board: LeaderboardPage;
  page: number;
  platform: PlatformFilter;
  trending: TrendingItem[];
  activity: ActivityItem[];
  stats: SiteStats;
};

export function HomeClient({
  initial,
  showSideCards = false,
}: {
  initial: InitialData;
  showSideCards?: boolean;
}) {
  const { t } = useLang();
  const [board, setBoard] = useState(initial.board);
  const [platform, setPlatform] = useState<PlatformFilter>(initial.platform);
  const [trending, setTrending] = useState(initial.trending);
  const [activity, setActivity] = useState(initial.activity);
  const [stats, setStats] = useState(initial.stats);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBoard = useCallback(
    async (p: PlatformFilter) => {
      try {
        const [bRes, sRes, tRes, aRes] = await Promise.all([
          fetch(`/api/board?page=1&platform=${p}`, { cache: "no-store" }),
          fetch("/api/stats", { cache: "no-store" }),
          // side cards hidden → skip their fetches entirely
          showSideCards ? fetch("/api/board?section=trending", { cache: "no-store" }) : null,
          showSideCards ? fetch("/api/board?section=activity", { cache: "no-store" }) : null,
        ]);
        const b = await bRes.json();
        const st = await sRes.json();
        if (b.listings) setBoard(b);
        if (st && typeof st === "object") setStats((prev) => ({ ...prev, ...st }));
        if (tRes) {
          const tr = await tRes.json();
          if (tr.items) setTrending(tr.items);
        }
        if (aRes) {
          const ac = await aRes.json();
          if (ac.items) setActivity(ac.items);
        }
      } catch {
        /* offline — keep current data */
      }
    },
    [showSideCards]
  );

  const refresh = useCallback(() => loadBoard(platform), [loadBoard, platform]);

  // Debounced refresh wrapper (realtime events can arrive in bursts).
  const refreshDebounced = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 300);
  }, [refresh]);

  const onPlatformChange = useCallback(
    (p: PlatformFilter) => {
      setPlatform(p);
      setBoard((prev) => ({ ...prev, listings: [], ranks: [] }));
      loadBoard(p);
      // Keep the URL shareable without a full navigation.
      const url = new URL(window.location.href);
      if (p === "all") url.searchParams.delete("platform");
      else url.searchParams.set("platform", p);
      url.searchParams.delete("page");
      url.hash = "leaderboard";
      window.history.replaceState(null, "", url.toString());
    },
    [loadBoard]
  );

  // Live updates: Supabase Realtime when configured, polling otherwise.
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key && process.env.NEXT_PUBLIC_MOCK_MODE !== "true") {
      let client: SupabaseClient | null = null;
      try {
        client = createClient(url, key);
        const channel = client
          .channel("board")
          .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, refreshDebounced)
          .on("postgres_changes", { event: "*", schema: "public", table: "activity" }, refreshDebounced)
          .subscribe();
        return () => {
          channel.unsubscribe();
        };
      } catch {
        /* fall through to polling */
      }
    }
    const iv = setInterval(refresh, 12_000);
    return () => clearInterval(iv);
  }, [refresh, refreshDebounced]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const boardEmpty = board.totalAll === 0 || (board.total === 0 && platform === "all");

  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pt-4 pb-16">
        <header className="mb-5 text-center">
          <h1 className="sr-only">outbidarabs.lol</h1>
          <OnlinePill initialOnline={initial.stats.online} initialVisitors={initial.stats.visitors} />
        </header>
        <div className="flex flex-col gap-6">
          {/* ── Hero ── */}
          <section className="text-center">
            <h2 className="text-[26px] leading-tight font-bold tracking-[-0.03em] text-pretty md:text-4xl">
              {t.headline}
            </h2>
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-bold text-primary md:text-sm">
              {t.headlineTagline}
            </p>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground text-pretty md:text-base">
              {t.supporting}
            </p>
          </section>

          <ClaimForm topBid={board.topBid} />

          {/* ── Board ── */}
          <div>
            <PlatformFilterPills active={platform} onChange={onPlatformChange} />
            {showSideCards && (
              <div className="mb-6 grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
                <TrendingCard items={trending} />
                <ActivityCard items={activity} />
              </div>
            )}
            <div id="leaderboard" className="scroll-mt-6">
              {boardEmpty ? (
                <div className="my-10 text-center">
                  <p className="text-lg font-bold text-foreground text-pretty">
                    {t.boardEmpty}
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground text-pretty">
                    {t.boardEmptyCta}
                  </p>
                </div>
              ) : board.total === 0 && platform !== "all" ? (
                <div className="my-10 text-center">
                  <p className="text-sm font-semibold text-foreground text-pretty">
                    {t.platformEmpty(platform)}
                  </p>
                </div>
              ) : (
                <div>
                  {board.listings.map((listing: Listing, i: number) => {
                    const rank = board.ranks?.[i] ?? (initial.page - 1) * PER_PAGE + i + 1;
                    const after3 = rank === 3;
                    const after10 = rank === 10;
                    return (
                      <ListingRow
                        key={listing.id}
                        listing={listing}
                        rank={rank}
                        isTop3={rank <= 3}
                        isTop10={rank <= 10}
                        separatorAfter={
                          after3
                            ? { label: t.top, afterRank: 3 }
                            : after10
                              ? { label: t.top, afterRank: 10 }
                              : null
                        }
                      />
                    );
                  })}
                </div>
              )}
              {board.total > 0 && (
                <Pagination
                  page={initial.page}
                  totalPages={board.totalPages}
                  total={board.total}
                  onRefresh={refresh}
                />
              )}
            </div>
          </div>
          <EarningsCard revenue={stats.totalRevenue} launchedAt={stats.launchedAt} />
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
