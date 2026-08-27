"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useLang } from "@/lib/lang-context";
import { formatUsd } from "@/lib/format";
import { tiktokTrack } from "@/lib/tiktok";

// Post-payment landing. The payer logged in right before checkout, so there
// is nothing left to do here: show the result (mock applies instantly; real
// payments poll /api/payment-status until the webhook applies), then return
// to the board. No emails, no prompts.

function SuccessContent() {
  const { t, lang } = useLang();
  const params = useSearchParams();
  const [name] = useState(() => params.get("name") ?? "");
  const [amount] = useState(() => parseInt(params.get("amount") ?? "0", 10) || 0);
  const [paid] = useState(() => parseInt(params.get("charge") ?? "0", 10) || 0);
  const [rank] = useState(() => parseInt(params.get("rank") ?? "0", 10) || 0);
  const [applied, setApplied] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Mock payments apply synchronously — nothing to poll.
    if (isMock) return;

    // Real Dodo payment: poll until the webhook records it (bounded), then
    // head back to the board.
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
    // TikTok dedup id: minted at checkout, echoed back through Dodo as &ttx=.
    // Same value the webhook sends to TikTok's Events API, so one payment
    // counts exactly once even though both sides report it.
    const ttx =
      params.get("ttx") ??
      (() => {
        try {
          return sessionStorage.getItem("outbidarabs:ttx");
        } catch {
          return null;
        }
      })();
    if (!checkoutId) {
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
              if (!cancelled) {
                setApplied(true);
                // TikTok standard event: purchase conversion with value —
                // what TikTok optimizes bids against. Fired only once the
                // webhook confirms the payment applied.
                void tiktokTrack("CompletePayment", {
                  content_id: "leaderboard_bid",
                  content_name: "leaderboard_bid",
                  value: paid || amount,
                  currency: "USD",
                  event_id: ttx ?? undefined,
                });
                goBoard();
              }
              return;
            }
          }
        } catch {
          /* transient — keep polling */
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!cancelled) goBoard();
    })();
    return () => {
      cancelled = true;
    };
  }, [isMock, params, goBoard]);

  const ar = lang === "ar";

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
        {ar ? "تم تأكيد المزايدة بنجاح! 🎉" : "Bid confirmed! 🎉"}
      </h1>
      {name ? (
        <p className="mt-3 leading-relaxed text-muted-foreground">
          {ar ? (
            <>
              تهانينا! أصبح <span className="font-semibold text-foreground">{name}</span> على لوحة الصدارة الآن
              {rank > 0 && (
                <>
                  {" "}
                  في المركز <span className="font-semibold text-primary">#{rank}</span>
                </>
              )}
              {amount > 0 && <> بمبلغ {formatUsd(amount)}</>}.
            </>
          ) : (
            <>
              Congratulations! <span className="font-semibold text-foreground">{name}</span> is now live on the board
              {rank > 0 && (
                <>
                  {" "}
                  at rank <span className="font-semibold text-primary">#{rank}</span>
                </>
              )}
              {amount > 0 && <> for {formatUsd(amount)}</>}.
            </>
          )}
        </p>
      ) : (
        <p className="mt-3 leading-relaxed text-muted-foreground">
          {ar
            ? "جارٍ تأكيد طلبك… سيظهر حسابك على اللوحة خلال لحظات."
            : "Confirming your payment… your profile will appear on the board shortly."}
        </p>
      )}
      {!isMock && !applied && name && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground" role="status">
          {ar ? "جارٍ تسجيل المزايدة على اللوحة…" : "Recording your bid on the leaderboard…"}
        </p>
      )}
      <Link
        href="/#leaderboard"
        className="mt-8 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/80"
      >
        {ar ? "مشاهدة الترتيب على اللوحة ←" : "View your rank on the board →"}
      </Link>
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
