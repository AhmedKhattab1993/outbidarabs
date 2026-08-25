import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MOCK_SESSION_COOKIE, clearSession } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Clears the session in both modes: Supabase Auth cookies (real) and the mock
// session cookie (keyless). Clearing the mock cookie unconditionally is
// harmless in real mode.
export async function POST() {
  await clearSession();
  (await cookies()).set(MOCK_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
