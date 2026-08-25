import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, MOCK_MODE, ANON_PAYER } from "@/lib/store";
import DodoPayments from "dodopayments";

export const dynamic = "force-dynamic";

// Success-page payment lookup: has the webhook applied the payment yet, and
// — only for the browser that initiated the checkout — which email paid (so
// the page can offer the non-blocking signup prompt)?
//
// The id is either the Dodo payment id (appended by Dodo to the return URL)
// or the checkout session id stashed client-side before redirecting. The
// payer email is revealed ONLY when the request carries the pay_* cookie
// token issued at checkout creation (matched by VALUE, so polling by payment
// id or session id both work). Any other holder of the unguessable id gets
// applied/attributed with payerEmail null — no prompt, no PII.

/** True when the request carries the pay_* cookie holding this token. */
function cookieCarriesToken(req: NextRequest, token: string | null): boolean {
  if (!token) return false;
  return req.cookies.getAll().some((c) => c.name.startsWith("pay_") && c.value === token);
}

/** Stored token for a checkout/payment id (checkout_tokens). */
async function tokenFor(db: ReturnType<typeof supabaseAdmin>, checkoutId: string): Promise<string | null> {
  const { data } = await db.from("checkout_tokens").select("token").eq("checkout_id", checkoutId).maybeSingle();
  return (data as { token?: string } | null)?.token ?? null;
}

export async function GET(req: NextRequest) {
  const checkout = (new URL(req.url).searchParams.get("checkout") ?? "").trim().slice(0, 80);
  if (!checkout) return NextResponse.json({ error: "invalid_params" }, { status: 400 });

  if (MOCK_MODE) {
    // Mock payments apply synchronously — the payments row exists already.
    const { mockPayments } = await import("@/lib/store");
    const row = mockPayments().find((p) => p.checkout_id === checkout);
    if (!row) return NextResponse.json({ applied: false });
    // Unknown payer → null (the success page shows no prompt, not the sentinel).
    const email = row.payer_email === ANON_PAYER ? null : row.payer_email;
    // Reveal only to the browser holding the checkout's pay_* cookie token.
    const payerEmail = cookieCarriesToken(req, row.token) ? email : null;
    return NextResponse.json({ applied: true, attributed: !!row.user_id, payerEmail });
  }

  const db = supabaseAdmin();
  const { data: byCheckout } = await db
    .from("payments")
    .select("payer_email, user_id")
    .eq("checkout_id", checkout)
    .maybeSingle();
  if (byCheckout) {
    const row = byCheckout as { payer_email: string; user_id: string | null };
    // Already attributed to an account → no prompt needed for this payer.
    // Unknown payer → null email (no prompt — the sentinel never leaks).
    const email = row.payer_email === ANON_PAYER ? null : row.payer_email;
    const token = await tokenFor(db, checkout);
    const payerEmail = cookieCarriesToken(req, token) ? email : null;
    return NextResponse.json({ applied: true, attributed: !!row.user_id, payerEmail });
  }

  // A checkout session id → resolve its payment id, then the payments row.
  // applied stays false until the webhook has recorded the payment — that's
  // exactly what the success page polls for.
  if (process.env.DODO_API_KEY) {
    try {
      const dodo = new DodoPayments({
        bearerToken: process.env.DODO_API_KEY,
        environment: process.env.DODO_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode",
      });
      const session = await dodo.checkoutSessions.retrieve(checkout);
      if (session.payment_id) {
        const { data: byPayment } = await db
          .from("payments")
          .select("payer_email, user_id")
          .eq("checkout_id", session.payment_id)
          .maybeSingle();
        if (byPayment) {
          const row = byPayment as { payer_email: string; user_id: string | null };
          const email = row.payer_email === ANON_PAYER ? null : row.payer_email;
          // Token row is keyed by the payment id (written by the webhook apply).
          const token = await tokenFor(db, session.payment_id);
          const payerEmail = cookieCarriesToken(req, token) ? email : null;
          return NextResponse.json({ applied: true, attributed: !!row.user_id, payerEmail });
        }
      }
    } catch (e) {
      // Unknown id / API hiccup — keep polling from the client.
      console.warn("payment-status session lookup failed", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ applied: false });
}
