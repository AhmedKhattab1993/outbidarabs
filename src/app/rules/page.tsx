"use client";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useLang } from "@/lib/lang-context";

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

export default function RulesPage() {
  const { t } = useLang();
  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pt-4 pb-16">
        <div className="mx-auto w-full max-w-xl">
          <h1 className="text-3xl font-bold tracking-[-0.03em]">{t.rulesTitle}</h1>
          <P>{t.rulesIntro}</P>

          <H2>{t.rulesRankingTitle}</H2>
          <P>
            {t.rulesRanking1} <Code>$5</Code> {t.rulesRankingMin}، <Code>$999,999</Code>{" "}
            {t.rulesRankingMax}، <Code>$1</Code> {t.rulesRankingTime}
          </P>
          <P>{t.rulesRanking2}</P>
          <P>{t.rulesRanking3}</P>
          <P>{t.rulesRanking4}</P>

          <H2>{t.rulesCanTitle}</H2>
          <P>• {t.rulesCan1}</P>
          <P>• {t.rulesCan2}</P>
          <P>• {t.rulesCan3}</P>
          <P>• {t.rulesCan4}</P>
          <P>• {t.rulesCan5}</P>

          <H2>{t.rulesAfterTitle}</H2>
          <P>• {t.rulesAfter1}</P>
          <P>• {t.rulesAfter2}</P>
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
