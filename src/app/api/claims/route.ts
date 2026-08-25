import { NextRequest, NextResponse } from "next/server";
import { createClaim, getSessionUser } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Claim card ownership (docs/accounts-workflow.md flow 3). Requires login —
// claiming is the only action that does. One owner per card: first claim
// wins; the honor system (D1) with the existing manual takedown backstop.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  let body: { listingId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* no body */
  }
  const listingId = (body.listingId ?? "").trim();
  if (!listingId) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const result = await createClaim(listingId, user.id);
  if (result.ok) return NextResponse.json({ ok: true });
  if (result.reason === "already-claimed") {
    return NextResponse.json(
      { error: "already_claimed", ownerName: result.owner.name },
      { status: 409 }
    );
  }
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
