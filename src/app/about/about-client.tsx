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
                  شاهدنا{" "}
                  <a
                    target="_blank"
                    rel="noopener"
                    className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-primary"
                    href="https://outbid.lol"
                  >
                    outbid.lol
                  </a>{" "}
                  وتابعنا كيف تحوّلت فكرة بسيطة — الترتيب هو السعر — إلى سباق مفتوح.
                  أعجبتنا الفكرة كثيراً، فقررنا نبني نسختنا العربية منها: نفس القواعد،
                  نفس الشفافية، لكن بالعربية وبواجهة RTL ودفع يعمل مع بطاقات المنطقة —
                  لرواد الأعمال والمبدعين في مصر والسعودية والإمارات والكويت وقطر
                  والبحرين والأردن والمغرب وكل العالم العربي. هذه ليست ترجمة؛ إنها
                  اللوحة العربية للـ Outbid.
                </p>
                <p className="font-semibold text-foreground">
                  اللوحة هنا. الترتيب هو السعر — لا شيء غير ذلك.
                </p>
              </>
            ) : (
              <>
                <p className="pt-2">
                  We watched{" "}
                  <a
                    target="_blank"
                    rel="noopener"
                    className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-primary"
                    href="https://outbid.lol"
                  >
                    outbid.lol
                  </a>{" "}
                  turn “rank is the bid” into an open race — and we loved the idea enough
                  to build the Arab-world edition: same rules, same transparency,
                  Arabic-first, RTL, and payments that work with regional cards. Built
                  for founders, startups, freelancers, agencies and creators across
                  Egypt, Saudi, UAE, Kuwait, Qatar, Bahrain, Jordan, Morocco and beyond.
                  This is not a translation; it is the Arab outbid board.
                </p>
                <p className="font-semibold text-foreground">
                  The board is here. Rank is the bid — nothing else.
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
