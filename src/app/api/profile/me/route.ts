import { NextRequest, NextResponse } from "next/server";
import {
  getClaimedCards,
  getPaymentsByCard,
  getProfile,
  getSessionUser,
  updateProfile,
} from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Private profile data: profile fields + payments grouped per card (with the
// user's rank on each card's supporters list) + claimed cards with board rank.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  const [profile, cards, claims] = await Promise.all([
    getProfile(user.id),
    getPaymentsByCard(user.id, user.email),
    getClaimedCards(user.id),
  ]);
  return NextResponse.json({ email: user.email, profile, cards, claims });
}

// Profile edits (spec flow 4): display name + public/private toggle only.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  let body: { display_name?: string; is_public?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (body.display_name !== undefined && typeof body.display_name !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (body.is_public !== undefined && typeof body.is_public !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const profile = await updateProfile(user.id, {
    display_name: body.display_name,
    is_public: body.is_public,
  });
  if (!profile) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, profile });
}
