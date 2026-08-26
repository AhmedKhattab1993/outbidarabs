import { NextResponse } from "next/server";
import { getProfile, getSessionUser } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Current session → user + profile (null when signed out). Read by the
// client auth context (and the claim-form pay gate's 401 recheck).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });
  const profile = await getProfile(user.id);
  return NextResponse.json({
    user: {
      id: user.id,
      publicId: profile?.public_id ?? null, // own opaque id — 'you' matching + /u/ links
      email: user.email,
      profile: profile
        ? {
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            is_public: profile.is_public,
            created_at: profile.created_at,
          }
        : null,
    },
  });
}
