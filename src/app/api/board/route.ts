import { NextRequest, NextResponse } from "next/server";
import { getActivity, getLeaderboard, getTrending } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get("section");

  try {
    if (section === "trending") {
      return NextResponse.json({ items: await getTrending(5) });
    }
    if (section === "activity") {
      return NextResponse.json({ items: await getActivity(6) });
    }
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    return NextResponse.json(await getLeaderboard(page));
  } catch (e) {
    console.error("board api error", e);
    return NextResponse.json({ error: "board_unavailable" }, { status: 500 });
  }
}
