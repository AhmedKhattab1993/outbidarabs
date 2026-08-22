import type { Metadata } from "next";
import Script from "next/script";
import { DM_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { LangProvider } from "@/lib/lang-context";
import { getDict, type Lang } from "@/lib/i18n";
import { Analytics } from "@/lib/analytics";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "outbidarabs.lol",
  description:
    "أول منصة عربية للـ Outbid — مستوحاة من outbid.lol. الترتيب هو السعر. No API keys, no revenue sharing. Just outbid your competition.",
  openGraph: {
    title: "outbidarabs.lol",
    description:
      "The Arab-world outbid leaderboard — inspired by outbid.lol. Rank is the bid. Will you take #1 when this site goes viral?",
    type: "website",
  },
};

// Analytics (DataFast): the official SDK is initialized client-side in
// src/lib/analytics.ts. NEXT_PUBLIC_ANALYTICS_URL is the public dashboard
// linked from "see stats →" and the footer.
const ANALYTICS_SCRIPT_URL = process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT_URL;
const ANALYTICS_SITE_ID = process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const lang: Lang = cookieStore.get("lang")?.value === "en" ? "en" : "ar";
  const t = getDict(lang);

  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${plexArabic.variable} min-h-full flex flex-col font-sans`}
      >
        {ANALYTICS_SCRIPT_URL && (
          <Script
            src={ANALYTICS_SCRIPT_URL}
            strategy="afterInteractive"
            data-site-id={ANALYTICS_SITE_ID || undefined}
          />
        )}
        <Analytics />
        <ThemeProvider>
          <LangProvider initialLang={lang}>{children}</LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
