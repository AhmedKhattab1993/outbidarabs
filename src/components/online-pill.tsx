"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang-context";

export function OnlinePill({
  initialOnline,
  initialVisitors,
}: {
  initialOnline: number;
  initialVisitors: number;
}) {
  const { t } = useLang();
  const [online, setOnline] = useState(initialOnline);
  const [visitors, setVisitors] = useState(initialVisitors);

  useEffect(() => {
    // Count this visit once per session
    const key = "visited-outbidarabs";
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      fetch("/api/visit", { method: "POST" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      fetch("/api/stats", { cache: "no-store" })
        .then((r) => r.json())
        .then((s) => {
          if (typeof s.online === "number" && s.online > 0) setOnline(s.online);
          if (typeof s.visitors === "number") setVisitors(s.visitors);
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <a
      target="_blank"
      rel="noopener"
      className="inline-block max-w-full rounded-full bg-muted px-3 py-1.5 text-center text-sm text-balance text-muted-foreground transition-colors hover:text-foreground"
      href="/about"
    >
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="relative inline-flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-live" />
        </span>
        <span className="font-semibold text-live">
          {online.toLocaleString("en-US")} {t.onlineNow}
        </span>
      </span>
      <span>
        {" "}
        · {visitors.toLocaleString("en-US")} {t.visitorsSinceLaunch}
      </span>
      <span className="text-foreground"> · {t.seeStats}</span>
    </a>
  );
}
