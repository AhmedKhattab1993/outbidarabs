import { NextResponse } from "next/server";
import { bumpVisitors } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  await bumpVisitors();
  return NextResponse.json({ ok: true });
}
