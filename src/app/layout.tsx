import type { Metadata } from "next";
import Script from "next/script";
import { DM_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { LangProvider } from "@/lib/lang-context";
import { AuthProvider } from "@/lib/auth-context";
import { getDict, type Lang } from "@/lib/i18n";
import { Analytics } from "@/lib/analytics";
import { TikTokPixel } from "@/lib/tiktok";
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
  title: "outbidarabs.lol — تصدّر اللوحة على إنستجرام وتيك توك · Claim the #1 Spot",
  description:
    "لوحة الترتيب المباشرة في العالم العربي: أعلى مزايدة = المركز الأول. أضف حسابك، ادعم صانعك المفضل، وتصدّر المشهد. The live pay-to-rank leaderboard for creators and brands.",
  openGraph: {
    title: "outbidarabs.lol — The Arab Pay-to-Rank Leaderboard",
    description:
      "Highest bid = #1 spot. Rank your Instagram, TikTok, X, or website — or back your favorite creator to reach #1. Live across the Arab world.",
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
        <TikTokPixel />
        <ThemeProvider>
          <LangProvider initialLang={lang}>
            <AuthProvider>
            <TikTokPixel />
            {children}
          </AuthProvider>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
