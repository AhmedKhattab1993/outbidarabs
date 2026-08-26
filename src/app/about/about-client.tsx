"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OnlinePill } from "@/components/online-pill";
import { useLang } from "@/lib/lang-context";
import { formatUsd, durationSince } from "@/lib/format";
import { MAX_BID } from "@/lib/i18n";
import type { SiteStats } from "@/lib/types";

export function AboutClient({ stats }: { stats: SiteStats }) {
  const { t, lang } = useLang();
  const ar = lang === "ar";

  const milestones = [
    `${t.highestBidSoFar} · ${stats.highestBidder ?? "—"} (${formatUsd(stats.highestBid)})`,
    t.listingsOnBoard(stats.listingCount),
    t.totalPaidSoFar(formatUsd(stats.totalRevenue)),
  ];

  // "Back a creator" deep-links into the home claim form prefilled with the
  // current #1 card and the delta that keeps it #1 (+$1 on its own lead).
  const ctaHref =
    stats.highestBidUrl && stats.highestBid > 0
      ? `/?boost=${encodeURIComponent(stats.highestBidUrl)}&pay=${Math.min(MAX_BID, stats.highestBid + 1)}#claim`
      : "/#leaderboard";

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
                  وهو يحوّل فكرة بسيطة — «الترتيب هو المزايدة نفسها» — إلى منافسة مفتوحة وممتعة.
                  ألهمتنا الفكرة، فبنينا النسخة المخصصة للعالم العربي، مع التركيز على صناع المحتوى ورواد الأعمال:
                  إنستجرام وتيك توك أولاً، ثم إكس ولينكدإن والمواقع والتطبيقات — بواجهة عربية كاملة
                  من اليمين لليسار، ودعم وسائل الدفع الإقليمية لصنّاع المحتوى
                  والمؤسسين في السعودية ومصر والإمارات والكويت وقطر والبحرين
                  والأردن والمغرب وكافة أرجاء العالم العربي.
                </p>
                <p>
                  ولا يُشترط أن تكون صاحب الحساب لتشارك؛ إذا أردت دعم صانع محتوى
                  أو مشروع تحبه، يمكنك رفع ترتيبه مباشرة: تدفع فارق المزايدة فقط، وينضم اسمك{" "}
                  <Link
                    href="/rules#ranking"
                    className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-primary"
                  >
                    لقائمة الداعمين
                  </Link>
                  .
                </p>
                <p className="font-semibold text-foreground">
                  المنافسة مفتوحة أمام الجميع: أعلى مزايدة = المركز الأول — بشفافية ووضوح.
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
                  turn “rank is the bid” into an engaging open race — and built the
                  Arab-world edition tailored for creators, founders, and digital brands:
                  Instagram and TikTok first, then X, LinkedIn, websites, and apps.
                  Arabic-first, RTL, with seamless payments built for regional cards across
                  Saudi Arabia, Egypt, UAE, Kuwait, Qatar, Bahrain, Jordan, Morocco, and beyond.
                </p>
                <p>
                  You don’t need your own listing to take part. Want to support a creator
                  you love? Raise their rank: pay only the difference, and your name
                  joins their{" "}
                  <Link
                    href="/rules#ranking"
                    className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-primary"
                  >
                    supporters list
                  </Link>
                  .
                </p>
                <p className="font-semibold text-foreground">
                  The board is live: highest bid = #1 spot — transparent and open.
                </p>
              </>
            )}
            <div className="pt-2">
              <Link
                href={ctaHref}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary transition-colors outline-none select-none hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {t.backCreatorCta}
              </Link>
            </div>
            <p className="text-sm">
              {t.sinceFromLaunch(durationSince(stats.launchedAt, t))}{" "}
              · {t.inspiredBy}
            </p>
          </div>
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
