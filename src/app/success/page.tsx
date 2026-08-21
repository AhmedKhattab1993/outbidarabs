"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useLang } from "@/lib/lang-context";
import { formatUsd } from "@/lib/format";

function SuccessContent() {
  const { t, lang } = useLang();
  const params = useSearchParams();
  const [name] = useState(() => params.get("name") ?? "");
  const [amount] = useState(() => parseInt(params.get("amount") ?? "0", 10) || 0);
  const [rank] = useState(() => parseInt(params.get("rank") ?? "0", 10) || 0);

  useEffect(() => {
    // In mock mode the listing is already applied. With real Polar checkout
    // the webhook applies it — give it a moment then head home.
    if (!params.get("mock")) {
      const timer = setTimeout(() => (window.location.href = "/#leaderboard"), 2500);
      return () => clearTimeout(timer);
    }
  }, [params]);

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
      <Link
        href="/#leaderboard"
        className="mt-8 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/80"
      >
        {ar ? "اذهب إلى اللوحة" : "Go to the board"}
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
