import type { Metadata } from "next";
import Script from "next/script";
import { DM_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { LangProvider } from "@/lib/lang-context";
import { getDict, type Lang } from "@/lib/i18n";
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
    "أول منصة عربية للـ Outbid — ادفع أقل من المنافس وارفع للترتيب الأول. No ads, no API keys, no revenue sharing. Just outbid your competition.",
  openGraph: {
    title: "outbidarabs.lol",
    description:
      "No ads, no API keys, no revenue sharing. Just outbid your competition to get to the top. Will you take #1 when this site goes viral?",
    type: "website",
  },
};

// Analytics (DataFast / Vemetric / any provider): set the script URL and
// site id from the provider's embed snippet; NEXT_PUBLIC_ANALYTICS_URL is
// the public dashboard linked from "see stats →" and the footer.
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
        <ThemeProvider>
          <LangProvider initialLang={lang}>{children}</LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
