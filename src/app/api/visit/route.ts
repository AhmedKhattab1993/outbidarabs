import { NextRequest, NextResponse } from "next/server";
import { bumpVisitors, getStats, heartbeat } from "@/lib/store";

export const dynamic = "force-dynamic";

// Presence heartbeat from the online pill (every ~30s per browser session).
// `count: true` on the first beat of a session also counts a new visitor.
export async function POST(req: NextRequest) {
  let body: { sid?: string; count?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* no body */
  }
  const sid = (body.sid ?? "").slice(0, 80);
  const online = sid ? await heartbeat(sid) : 0;
  if (body.count) await bumpVisitors();
  const stats = await getStats();
  return NextResponse.json({ online, visitors: stats.visitors });
}
