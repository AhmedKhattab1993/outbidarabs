"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/lib/auth-context";
import { EmailCodeForm, getPayerHint } from "@/components/email-code-form";
import { formatUsd } from "@/lib/format";

// Post-payment landing. Keeps the frictionless anonymous flow: the signup
// prompt (spec flow 1.3) is strictly optional and appears only when
//  - the payment is applied (webhook ran / mock applied instantly), and
//  - the payer isn't already logged in, and
//  - we know the payer email (Dodo payment row / typed in mock mode).
// Otherwise the page behaves exactly as before (auto-return to the board).

type Phase =
  | { kind: "checking" } // polling /api/payment-status
  | { kind: "prompt"; email: string; editable: boolean } // offer signup
  | { kind: "none" } // no prompt possible — legacy behavior
  | { kind: "done" }; // logged in via prompt

function SuccessContent() {
  const { t, lang } = useLang();
  const { user, loading, refresh } = useAuth();
  const params = useSearchParams();
  const [name] = useState(() => params.get("name") ?? "");
  const [amount] = useState(() => parseInt(params.get("amount") ?? "0", 10) || 0);
  const [rank] = useState(() => parseInt(params.get("rank") ?? "0", 10) || 0);
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set the moment the prompt login succeeds: the effect below must not
  // clobber the done state (or fire the board redirect) on the refresh rerun.
  const linkedRef = useRef(false);

  const isMock = params.get("mock") === "1";

  const goBoard = useCallback((delayMs = 2500) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => (window.location.href = "/#leaderboard"), delayMs);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (loading || linkedRef.current) return;
    if (user) {
      // Logged in already — payment attributes via metadata/customer_email.
      setPhase({ kind: "none" });
      if (!isMock) goBoard();
      return;
    }

    if (isMock) {
      // Mock: nothing is known — let the user type an email (optional).
      setPhase({ kind: "prompt", email: "", editable: true });
      return;
    }

    // Real Dodo payment: find it via the id Dodo appended to the return URL,
    // else the checkout session id stashed before redirecting, then poll
    // until the webhook records the payment.
    let cancelled = false;
    const checkoutId =
      params.get("payment_id") ??
      (() => {
        try {
          return sessionStorage.getItem("outbidarabs:checkout");
        } catch {
          return null;
        }
      })();

    if (!checkoutId) {
      setPhase({ kind: "none" });
      goBoard();
      return;
    }

    (async () => {
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        try {
          const res = await fetch(`/api/payment-status?checkout=${encodeURIComponent(checkoutId)}`, {
            cache: "no-store",
          });
          if (res.ok) {
            const data = await res.json();
            if (data.applied) {
              if (cancelled) return;
              // No prompt when the payment already belongs to an account or
              // the payer email is unknown (missing customer.email — an
              // editable email can't attribute a real Dodo payment).
              if (data.attributed || !data.payerEmail) {
                setPhase({ kind: "none" });
                goBoard();
              } else {
                setPhase({ kind: "prompt", email: data.payerEmail, editable: false });
              }
              return;
            }
          }
        } catch {
          /* transient — keep polling */
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!cancelled) {
        setPhase({ kind: "none" });
        goBoard();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user, isMock, params, goBoard]);

  const ar = lang === "ar";
  const prompt = phase.kind === "prompt" ? phase : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/15">
        <svg viewBox="0 0 24 24" fill="none" className="size-8" aria-hidden="true">
          <path
            d="M20 6L9 17l-5-5"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-[-0.03em]">
        {ar ? "تم الدفع بنجاح!" : "Payment successful!"}
      </h1>
      {name ? (
        <p className="mt-3 leading-relaxed text-muted-foreground">
          {ar ? (
            <>
              <span className="font-semibold text-foreground">{name}</span> على اللوحة الآن
              {rank > 0 && (
                <>
                  {" "}
                  في المركز <span className="font-semibold text-primary">#{rank}</span>
                </>
              )}
              {amount > 0 && <> بسعر {formatUsd(amount)}</>}
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">{name}</span> is on the board
              {rank > 0 && (
                <>
                  {" "}
                  at rank <span className="font-semibold text-primary">#{rank}</span>
                </>
              )}
              {amount > 0 && <> for {formatUsd(amount)}</>}
            </>
          )}
        </p>
      ) : (
        <p className="mt-3 leading-relaxed text-muted-foreground">
          {ar
            ? "جارٍ تأكيد طلبك… سيظهر إدراجك على اللوحة خلال لحظات."
            : "Confirming your order… your listing will appear on the board shortly."}
        </p>
      )}

      {/* ── Optional account prompt (never blocks the payment result) ── */}
      {phase.kind === "done" ? (
        <div className="mt-8 w-full max-w-sm">
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{t.linkedDone}</p>
          <Link
            href="/profile"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/80"
          >
            {t.navProfile}
          </Link>
        </div>
      ) : prompt ? (
        <div className="mt-8 w-full max-w-sm rounded-3xl border bg-card p-4 shadow-sm md:p-5">
          <h2 className="text-sm font-bold tracking-[-0.02em] text-pretty">
            {prompt.editable ? t.signupPromptMockTitle : t.signupPromptTitle}
          </h2>
          <p className="mt-1 mb-4 text-xs leading-relaxed text-muted-foreground text-pretty">
            {prompt.editable ? t.signupPromptMockBody : t.signupPromptBody(prompt.email)}
          </p>
          <EmailCodeForm
            compact
            initialEmail={prompt.email || undefined}
            startAtCode={!prompt.editable && !!prompt.email}
            mockPayerHint={getPayerHint()}
            onDone={async () => {
              linkedRef.current = true;
              await refresh();
              setPhase({ kind: "done" });
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
              window.location.href = "/#leaderboard";
            }}
            className="mt-4 cursor-pointer text-xs font-semibold text-muted-foreground hover:underline"
          >
            {t.later}
          </button>
        </div>
      ) : (
        <Link
          href="/#leaderboard"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/80"
        >
          {ar ? "اذهب إلى اللوحة" : "Go to the board"}
        </Link>
      )}
    </div>
  );
}

export default function SuccessPage() {
  return (
    <>
      <SiteHeader />
      <Suspense
        fallback={
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pt-4 pb-16" />
        }
      >
        <SuccessContent />
      </Suspense>
      <SiteFooter />
    </>
  );
}
