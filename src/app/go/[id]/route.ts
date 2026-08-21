import { NextRequest, NextResponse } from "next/server";
import { registerClick } from "@/lib/store";

export const dynamic = "force-dynamic";

// Click redirect: increments counters then forwards to the listing URL.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = await registerClick(id);
  if (!url) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.redirect(url, 302);
}
