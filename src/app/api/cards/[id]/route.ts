import { NextRequest, NextResponse } from "next/server";
import { getCardState } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Card drawer data: card info + ranked supporters (identities resolved,
// anonymous for private users — never emails). Cards are agnostic — no
// ownership, no edits: metadata is source-fetched and immutable.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const state = await getCardState(id);
  return NextResponse.json(state);
}
