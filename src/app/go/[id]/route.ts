import { NextResponse } from "next/server";
import { registerClick } from "@/lib/store";

export const dynamic = "force-dynamic";

// Click redirect: increments counters then forwards to the listing URL
// (with our utm_source appended, like the reference does).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const href = await registerClick(id);
  if (!href) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let target = href;
  try {
    const u = new URL(href);
    u.searchParams.set("utm_source", "outbidarabs");
    target = u.toString();
  } catch {
    /* leave as-is */
  }
  return NextResponse.redirect(target, 302);
}
