import { NextRequest, NextResponse } from "next/server";
import { getBids, getActivity, getLeaderboard, getTrending } from "@/lib/store";
import { isPlatformFilter } from "@/lib/platforms";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get("section");

  try {
    if (section === "trending") {
      return NextResponse.json({ items: await getTrending(5) });
    }
    if (section === "bids") {
      return NextResponse.json({ bids: await getBids() });
    }
    if (section === "activity") {
      return NextResponse.json({ items: await getActivity(6) });
    }
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const platformParam = searchParams.get("platform");
    const platform = isPlatformFilter(platformParam) ? platformParam : "all";
    return NextResponse.json(await getLeaderboard(page, platform));
  } catch (e) {
    console.error("board api error", e);
    return NextResponse.json({ error: "board_unavailable" }, { status: 500 });
  }
}
