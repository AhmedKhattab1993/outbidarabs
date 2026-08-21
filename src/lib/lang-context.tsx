"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { getDict, Dict, Lang } from "@/lib/i18n";

type LangContextValue = {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: Dict;
  toggleLang: () => void;
};

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({
  initialLang,
  children,
}: {
  initialLang: Lang;
  children: ReactNode;
}) {
  const [lang, setLang] = useState<Lang>(initialLang);

  const toggleLang = useCallback(() => {
    const next: Lang = lang === "ar" ? "en" : "ar";
    setLang(next);
    document.cookie = `lang=${next};path=/;max-age=31536000`;
    const html = document.documentElement;
    html.lang = next;
    html.dir = next === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const value: LangContextValue = {
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    t: getDict(lang),
    toggleLang,
  };

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}
