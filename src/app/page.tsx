import { HomeClient } from "@/components/home-client";
import { getActivity, getLeaderboard, getStats, getTrending } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [board, trending, activity, stats] = await Promise.all([
    getLeaderboard(page),
    getTrending(5),
    getActivity(6),
    getStats(),
  ]);

  return <HomeClient initial={{ board, page, trending, activity, stats }} />;
}
