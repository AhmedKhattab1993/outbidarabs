import { HomeClient } from "@/components/home-client";
import { getActivity, getLeaderboard, getStats, getTrending } from "@/lib/store";
import { isPlatformFilter, type PlatformFilter } from "@/lib/platforms";

export const dynamic = "force-dynamic";

// Trending/Activity side cards: implemented but hidden at launch.
// NEXT_PUBLIC_SHOW_TRENDING_ACTIVITY=true re-enables them (config-only, no
// code change). Hidden also skips the two DB queries + client fetches.
const SHOW_SIDE_CARDS = process.env.NEXT_PUBLIC_SHOW_TRENDING_ACTIVITY === "true";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; platform?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const platform: PlatformFilter = isPlatformFilter(params.platform) ? params.platform : "all";

  const [board, trending, activity, stats] = await Promise.all([
    getLeaderboard(page, platform),
    SHOW_SIDE_CARDS ? getTrending(5) : Promise.resolve([]),
    SHOW_SIDE_CARDS ? getActivity(5) : Promise.resolve([]),
    getStats(),
  ]);

  return (
    <HomeClient
      showSideCards={SHOW_SIDE_CARDS}
      initial={{ board, page, platform, trending, activity, stats }}
    />
  );
}
