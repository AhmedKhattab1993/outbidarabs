"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ActivityItem, LeaderboardPage, Listing, SiteStats, TrendingItem } from "@/lib/types";
import { useLang } from "@/lib/lang-context";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OnlinePill } from "@/components/online-pill";
import { ClaimForm } from "@/components/claim-form";
import { TrendingCard, ActivityCard } from "@/components/boards-cards";
import { ListingRow } from "@/components/listing-row";
import { Pagination } from "@/components/pagination";

type InitialData = {
  board: LeaderboardPage;
  page: number;
  trending: TrendingItem[];
  activity: ActivityItem[];
  stats: SiteStats;
};

export function HomeClient({ initial }: { initial: InitialData }) {
  const { t } = useLang();
  const [board, setBoard] = useState(initial.board);
  const [trending, setTrending] = useState(initial.trending);
  const [activity, setActivity] = useState(initial.activity);

  const refresh = useCallback(async () => {
    try {
      const [bRes, tRes, aRes] = await Promise.all([
        fetch(`/api/board?page=${initial.page}`, { cache: "no-store" }),
        fetch("/api/board?section=trending", { cache: "no-store" }),
        fetch("/api/board?section=activity", { cache: "no-store" }),
      ]);
      const b = await bRes.json();
      const tr = await tRes.json();
      const ac = await aRes.json();
      if (b.listings) setBoard(b);
      if (tr.items) setTrending(tr.items);
      if (ac.items) setActivity(ac.items);
    } catch {
      /* offline — keep current data */
    }
  }, [initial.page]);

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
          .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, refresh)
          .on("postgres_changes", { event: "*", schema: "public", table: "activity" }, refresh)
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
  }, [refresh]);

  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pt-4 pb-16">
        <header className="mb-6 text-center">
          <h1 className="sr-only">outbidsarabs.lol</h1>
          <OnlinePill initialOnline={initial.stats.online} initialVisitors={initial.stats.visitors} />
        </header>
        <div className="flex flex-col gap-6">
          <ClaimForm topBid={board.topBid} />
          <div>
            <div className="mb-6 grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              <TrendingCard items={trending} />
              <ActivityCard items={activity} />
            </div>
            <div id="leaderboard" className="scroll-mt-6">
              <div>
                {board.listings.map((listing: Listing, i: number) => {
                  const rank = (initial.page - 1) * 15 + i + 1;
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
            </div>
            <Pagination page={initial.page} totalPages={board.totalPages} />
          </div>
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
