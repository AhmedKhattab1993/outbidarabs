"use client";

import { useLang } from "@/lib/lang-context";
import { ANALYTICS_URL } from "@/components/online-pill";

export function SiteFooter() {
  const { t } = useLang();
  const statsHref = ANALYTICS_URL || "/about";
  return (
    <footer className="mt-16 pb-8 text-center">
      <p className="text-sm text-muted-foreground">
        <a
          target="_blank"
          rel="noopener"
          className="text-primary transition-colors hover:text-primary/80"
          href="https://outbid.lol"
        >
          {t.inspiredBy}
        </a>{" "}
        ·{" "}
        <a className="text-primary transition-colors hover:text-primary/80" href="/rules">
          {t.footerRules}
        </a>{" "}
        ·{" "}
        <a
          target={ANALYTICS_URL ? "_blank" : undefined}
          rel={ANALYTICS_URL ? "noopener" : undefined}
          className="text-primary transition-colors hover:text-primary/80"
          href={statsHref}
        >
          {t.footerLiveStats}
        </a>
      </p>
    </footer>
  );
}
