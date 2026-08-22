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
                  أعجبتنا الفكرة كثيراً، فبنينا نسختنا العربية منها بتركيز على
                  حسابات التواصل الاجتماعي: إنستجرام وتيك توك أولاً، وكمان إكس
                  ولينكدإن والمواقع والتطبيقات — بالعربية وبواجهة RTL ودفع يعمل
                  مع بطاقات المنطقة، لمبدعي ومؤسسي مصر والسعودية والإمارات
                  والكويت وقطر والبحرين والأردن والمغرب وكل العالم العربي.
                </p>
                <p className="font-semibold text-foreground">
                  اللوحة هنا. أعلى عرض = المركز الأول — لا شيء غير ذلك.
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
                  to build the Arab-world edition, focused on social accounts:
                  Instagram and TikTok first, then X, LinkedIn, websites and apps.
                  Arabic-first, RTL, with payments that work with regional cards —
                  built for creators and founders across Egypt, Saudi, UAE, Kuwait,
                  Qatar, Bahrain, Jordan, Morocco and beyond.
                </p>
                <p className="font-semibold text-foreground">
                  The board is here. Highest bid = #1 — nothing else.
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
