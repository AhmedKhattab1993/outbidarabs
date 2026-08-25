"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/lib/auth-context";
import { UserAvatar } from "@/components/user-avatar";

export function SiteHeader() {
  const { t, lang, toggleLang } = useLang();
  const { user, loading, openLogin } = useAuth();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const links = [
    { href: "/", label: t.navLeaderboard },
    { href: "/about", label: t.navAbout },
    { href: "/rules", label: t.navRules },
  ];

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <header className="w-full">
      {/* Mobile (<sm): the nav wraps to a centered second row so logo +
          lang/theme buttons fit without horizontal overflow. Desktop is a
          single row: logo left, nav + buttons grouped right. */}
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pt-4 pb-3 sm:flex-nowrap sm:justify-start sm:gap-x-4 sm:pt-5 sm:pb-4">
        <a
          className="inline-flex shrink-0 items-center gap-1.5 font-medium tracking-[-0.04em] text-[22px]"
          href="/"
        >
          <svg viewBox="0 0 36 28" fill="none" aria-hidden="true" className="w-auto h-5">
            <rect x="22" y="0" width="14" height="6" rx="3" className="fill-primary" />
            <rect x="12" y="11" width="24" height="6" rx="3" className="fill-foreground" />
            <rect x="0" y="22" width="36" height="6" rx="3" className="fill-foreground" />
          </svg>
          <span>
            {t.siteName}
            <span className="text-primary">.</span>lol
          </span>
        </a>
        <div className="order-2 flex items-center gap-2 sm:order-3 sm:gap-3">
          {/* Account: avatar → profile when signed in, log-in prompt otherwise.
              Login is never required to browse or pay (D5). */}
          {!loading &&
            (user ? (
              <Link
                href="/profile"
                aria-label={t.navProfile}
                title={t.navProfile}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-all hover:bg-muted hover:text-foreground dark:hover:bg-muted/50"
              >
                <UserAvatar
                  userId={user.publicId ?? user.email}
                  name={user.profile?.display_name || user.email}
                  className="size-7 text-xs ring-1 ring-black/5 dark:ring-white/10"
                />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openLogin()}
                className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/80"
              >
                {t.login}
              </button>
            ))}
          <button
            type="button"
            onClick={toggleLang}
            aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-sm font-bold transition-all outline-none select-none hover:bg-muted hover:text-foreground dark:hover:bg-muted/50"
          >
            {lang === "ar" ? "EN" : "ع"}
          </button>
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent transition-all outline-none select-none hover:bg-muted hover:text-foreground dark:hover:bg-muted/50"
          >
            {mounted && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="size-4"
              >
                {isDark ? (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                  </>
                ) : (
                  <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
                )}
              </svg>
            )}
          </button>
        </div>
        <nav aria-label="Main" className="order-3 w-full sm:order-2 sm:ml-auto sm:w-auto">
          <ul className="flex items-center justify-center gap-5 text-sm sm:justify-start sm:gap-5">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  aria-current={pathname === l.href ? "page" : undefined}
                  className={
                    "inline-flex min-h-10 items-center px-1 font-medium transition-colors hover:text-foreground " +
                    (pathname === l.href ? "text-foreground" : "text-muted-foreground")
                  }
                  href={l.href}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
