"use client";

import { useLang } from "@/lib/lang-context";
import { durationSince } from "@/lib/format";

/**
 * The viral earnings card from the reference:
 * "This simple side project made  $118,411  since its launch 56 hours ago"
 */
export function EarningsCard({ revenue, launchedAt }: { revenue: number; launchedAt: string }) {
  const { t } = useLang();
  return (
    <section className="mt-14 text-center">
      <p className="text-sm font-medium text-muted-foreground text-pretty">
        {t.earningsPrefix} <span className="text-primary">{t.earningsHighlight}</span>{" "}
        {t.earningsSuffix}
      </p>
      <div className="mx-auto mt-3 w-fit rounded-2xl bg-card px-8 py-5 shadow-[0_12px_50px_rgba(40,38,36,0.08)]">
        <p className="text-4xl font-bold tracking-[-0.03em] tabular-nums md:text-5xl">
          <span className="text-primary">$</span>
          {revenue.toLocaleString("en-US")}
        </p>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {t.sinceItsLaunch} {durationSince(launchedAt, t)}
      </p>
    </section>
  );
}
