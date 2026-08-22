"use client";

import { useLang } from "@/lib/lang-context";

export function SiteFooter() {
  const { t } = useLang();
  return (
    <footer className="mt-16 pb-8 text-center">
      <p className="text-sm text-muted-foreground">
        {t.footerBuiltBy}{" "}
        <a
          target="_blank"
          rel="noopener"
          className="text-primary transition-colors hover:text-primary/80"
          href="https://x.com/outbidarabs"
        >
          @outbidarabs
        </a>{" "}
        · {t.inspiredBy} ·{" "}
        <a className="text-primary transition-colors hover:text-primary/80" href="/rules">
          {t.footerRules}
        </a>{" "}
        ·{" "}
        <a className="text-primary transition-colors hover:text-primary/80" href="/about">
          {t.footerLiveStats}
        </a>
      </p>
    </footer>
  );
}
