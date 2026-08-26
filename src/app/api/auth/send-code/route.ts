import { NextRequest, NextResponse } from "next/server";
import { sendLoginCode, isValidEmail } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Step 1 of email-code login: sends a 6-digit code (Supabase Auth OTP in real
// mode; in-memory mock in keyless mode). Rate limited ~5 sends/hour/email.
export async function POST(req: NextRequest) {
  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* no body */
  }

  const email = (body.email ?? "").trim();
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "invalid-email" }, { status: 400 });
  }

  const result = await sendLoginCode(email);
  if (!result.ok) {
    const status =
      result.reason === "invalid-email" ? 400 : result.reason === "send-failed" ? 502 : 429;
    return NextResponse.json(
      { error: result.reason, retryAfterSec: result.retryAfterSec ?? undefined },
      { status }
    );
  }

  // devCode exists only in mock mode — surfaced in the UI (demo convenience).
  return NextResponse.json({ ok: true, devCode: result.devCode ?? undefined });
}
