"use client";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useLang } from "@/lib/lang-context";
import { MIN_BID } from "@/lib/i18n";
import { PLATFORMS, platformLabel } from "@/lib/platforms";
import { PlatformIcon } from "@/components/platform-icon";

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 leading-relaxed text-muted-foreground text-pretty">{children}</p>;
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-8 text-xl font-bold tracking-[-0.02em]">{children}</h2>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 text-[0.9em] font-semibold text-foreground">
      {children}
    </code>
  );
}

export function RulesClient() {
  const { t, lang } = useLang();
  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pt-4 pb-16">
        <div className="mx-auto w-full max-w-xl">
          <h1 className="text-3xl font-bold tracking-[-0.03em]">{t.rulesTitle}</h1>
          <P>{t.rulesIntro}</P>

          <H2>{t.rulesRankingTitle}</H2>
          <P>
            {t.rulesRanking1} <Code>{`$${MIN_BID}`}</Code> – <Code>$999,999</Code>.
          </P>
          <P>{t.rulesRankingTime}</P>
          <P>{t.rulesRanking2}</P>

          <H2>{t.rulesPlatformsTitle}</H2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <li
                key={p}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold"
              >
                <PlatformIcon platform={p} className="size-3.5" />
                {platformLabel(p, lang)}
              </li>
            ))}
          </ul>
          <P>{t.rulesPlatformsBody}</P>

          <H2>{t.rulesCanTitle}</H2>
          <P>• {t.rulesCan1}</P>
          <P>• {t.rulesCan2}</P>
          <P>• {t.rulesCan3}</P>

          <H2>{t.rulesAfterTitle}</H2>
          <P>• {t.rulesAfter1}</P>
          <P>• {t.rulesAfter2}</P>

          <p className="mt-8 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground text-pretty">
            {t.rulesOriginNote}
          </p>
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
