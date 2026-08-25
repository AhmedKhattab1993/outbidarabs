import { NextRequest, NextResponse } from "next/server";
import { getCardState, getSessionUser, ownerUpdateListing } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Card drawer data: ranked supporters (identities resolved, anonymous for
// private users — never emails) + the claimed owner, if any.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const state = await getCardState(id);
  return NextResponse.json(state);
}

// Owner edits (D6): description + image only. The listing URL is immutable —
// a URL change is a new card. Requires ownership of the claim.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  let body: { description?: string | null; image_url?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { id } = await ctx.params;
  // Surface bad image URLs as a distinct validation error (400) so the UI
  // can show the right copy; ownership failures stay 403.
  if (
    typeof body.image_url === "string" &&
    body.image_url.trim() &&
    !/^https:\/\/.+/i.test(body.image_url.trim())
  ) {
    return NextResponse.json({ error: "invalid_image_url" }, { status: 400 });
  }
  const listing = await ownerUpdateListing(id, user.id, body);
  if (!listing) return NextResponse.json({ error: "forbidden_or_invalid" }, { status: 403 });
  return NextResponse.json({ ok: true, listing });
}
