import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, MOCK_MODE } from "@/lib/store";
import DodoPayments from "dodopayments";

export const dynamic = "force-dynamic";

// Success-page payment poll: has the webhook applied the payment yet?
// Returns { applied, attributed } only — no emails, no tokens, no PII on any
// path. The id is either the Dodo payment id (appended by Dodo to the return
// URL) or the checkout session id stashed client-side before redirecting.

export async function GET(req: NextRequest) {
  const checkout = (new URL(req.url).searchParams.get("checkout") ?? "").trim().slice(0, 80);
  if (!checkout) return NextResponse.json({ error: "invalid_params" }, { status: 400 });

  if (MOCK_MODE) {
    // Mock payments apply synchronously — the payments row exists already.
    const { mockPayments } = await import("@/lib/store");
    const row = mockPayments().find((p) => p.checkout_id === checkout);
    return NextResponse.json({ applied: !!row, attributed: !!row?.user_id });
  }

  const db = supabaseAdmin();
  const { data: byCheckout } = await db
    .from("payments")
    .select("user_id")
    .eq("checkout_id", checkout)
    .maybeSingle();
  if (byCheckout) {
    const row = byCheckout as { user_id: string | null };
    return NextResponse.json({ applied: true, attributed: !!row.user_id });
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
          .select("user_id")
          .eq("checkout_id", session.payment_id)
          .maybeSingle();
        if (byPayment) {
          const row = byPayment as { user_id: string | null };
          return NextResponse.json({ applied: true, attributed: !!row.user_id });
        }
      }
    } catch (e) {
      // Unknown id / API hiccup — keep polling from the client.
      console.warn("payment-status session lookup failed", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ applied: false });
}
