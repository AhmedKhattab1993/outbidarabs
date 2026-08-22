import type { Metadata } from "next";
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
        <ThemeProvider>
          <LangProvider initialLang={lang}>{children}</LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
