import { NextRequest, NextResponse } from "next/server";
import { sendLoginCode, mockTagPayerEmail, isValidEmail, MOCK_MODE } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Step 1 of email-code login: sends a 6-digit code (Supabase Auth OTP in real
// mode; in-memory mock in keyless mode). Rate limited ~5 sends/hour/email.
//
// Retag order matters: the browser's anonymous payments are only retagged
// after the email validates AND the send succeeds, so a typo'd email never
// consumes the attribution hint. The hint must also match the generated
// browser format (ensurePayerHint in email-code-form.tsx: payer-<hex>@mock.local)
// — an arbitrary hint would let a caller retag someone else's anonymous
// payments on mock-payment layers.
const MOCK_PAYER_HINT = /^payer(-[a-z0-9]+)?@mock\.local$/;
export async function POST(req: NextRequest) {
  let body: { email?: string; mockPayerHint?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* no body */
  }

  const email = (body.email ?? "").trim();
  const hint = (body.mockPayerHint ?? "").trim();
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

  // Mock-payment layers (mock mode or Layer 2: real Supabase + mock
  // payments): the payments rows carry the browser hint email — retag them
  // to the verified-by-code email now that the send succeeded. Hints that
  // don't match the generated format are ignored (no error): they can't be
  // legitimate browser hints.
  if (
    hint &&
    MOCK_PAYER_HINT.test(hint) &&
    (MOCK_MODE || process.env.ALLOW_MOCK_PAYMENTS === "true")
  ) {
    await mockTagPayerEmail(hint, email);
  }

  // devCode exists only in mock mode — surfaced in the UI (demo convenience).
  return NextResponse.json({ ok: true, devCode: result.devCode ?? undefined });
}
