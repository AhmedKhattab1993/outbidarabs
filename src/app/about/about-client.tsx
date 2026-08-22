"use client";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OnlinePill } from "@/components/online-pill";
import { useLang } from "@/lib/lang-context";
import { formatUsd, durationSince } from "@/lib/format";
import type { SiteStats } from "@/lib/types";

export function AboutClient({ stats }: { stats: SiteStats }) {
  const { t, lang } = useLang();
  const ar = lang === "ar";

  const milestones = [
    `${t.highestBidSoFar} · ${stats.highestBidder ?? "—"} (${formatUsd(stats.highestBid)})`,
    t.listingsOnBoard(stats.listingCount),
    t.totalPaidSoFar(formatUsd(stats.totalRevenue)),
  ];

  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pt-4 pb-16">
        <div className="mx-auto w-full max-w-xl text-center">
          <h1 className="text-3xl font-bold tracking-[-0.03em]">{t.aboutTitle}</h1>

          <div className="mt-6 flex justify-center">
            <OnlinePill initialOnline={stats.online} initialVisitors={stats.visitors} />
          </div>

          <div className="mt-8 space-y-4 leading-relaxed text-muted-foreground text-pretty">
            <p>{t.launchedOnSentence(t.launchedOnDate)}</p>
            <p>{t.crazyThings}</p>
            <ul className="space-y-1.5">
              {milestones.map((m) => (
                <li key={m} className="font-semibold text-foreground">
                  {m}
                </li>
              ))}
            </ul>
            {ar ? (
              <>
                <p className="pt-2">
                  بدأت <span className="font-semibold text-foreground">outbidarabs.lol</span> كمشروع
                  جانبي بسيط: لا إعلانات، لا مفاتيح API، ولا مشاركة أرباح. زايد منافسيك فقط لتصل إلى
                  القمة — هذا كل شيء.
                </p>
                <p>
                  أول منصة عربية للـ Outbid. ادفع أقل من المنافس وارفع للترتيب الأول. موجهة لرواد
                  الأعمال العرب: مصر، السعودية، الإمارات، الكويت، قطر، البحرين، الأردن، المغرب
                  وكل العالم العربي.
                </p>
                <p className="font-semibold text-foreground">
                  اللوحة هنا. نفس القواعد. نفس الفكرة. الترتيب هو السعر — لا شيء غير ذلك.
                </p>
              </>
            ) : (
              <>
                <p className="pt-2">
                  <span className="font-semibold text-foreground">outbidarabs.lol</span> started as a
                  simple side project: no ads, no API keys, no revenue sharing. Just outbid your
                  competitors to rank #1 — that&apos;s it.
                </p>
                <p>
                  The first Arab-world outbid board. Built for Arab founders, startups, freelancers,
                  agencies and creators across Egypt, Saudi, UAE, Kuwait, Qatar, Bahrain, Jordan,
                  Morocco and beyond.
                </p>
                <p className="font-semibold text-foreground">
                  The board is still here. Same rules. Same idea. Rank is the bid — nothing else.
                </p>
              </>
            )}
            <p className="text-sm">
              {t.sinceItsLaunch} {durationSince(stats.launchedAt, t)} · {t.inspiredBy}
            </p>
          </div>
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
