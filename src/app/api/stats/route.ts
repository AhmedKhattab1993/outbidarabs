import { NextRequest, NextResponse } from "next/server";
import { getStats, bumpVisitors, MOCK_MODE } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getStats();
  return NextResponse.json(stats);
}

// Counts one visit per browser session (called once by the online pill).
export async function POST(req: NextRequest) {
  await bumpVisitors();
  const stats = await getStats();
  return NextResponse.json(stats);
}
