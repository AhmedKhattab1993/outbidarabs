import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  MOCK_MODE,
  MOCK_SESSION_COOKIE,
  verifyLoginCode,
} from "@/lib/accounts";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days (spec default)

// Step 2 of email-code login: verifies the code, creates the session (mock
// cookie or Supabase Auth), ensures the profile exists and backfills payment
// attribution for the verified email.
export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* no body */
  }

  const result = await verifyLoginCode(body.email ?? "", body.code ?? "");
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  if (result.mockToken) {
    (await cookies()).set(MOCK_SESSION_COOKIE, result.mockToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  }
  // Real mode: the @supabase/ssr client inside verifyLoginCode already set
  // the auth cookies against this request's cookie store.
  return NextResponse.json({ ok: true, user: result.user });
}
