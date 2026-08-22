"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang-context";

// Public analytics dashboard (parity with the reference's "see stats →").
// Falls back to /about when not configured.
export const ANALYTICS_URL = process.env.NEXT_PUBLIC_ANALYTICS_URL || "";

function sessionId(): string {
  try {
    let sid = sessionStorage.getItem("outbidarabs-sid");
    if (!sid) {
      sid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("outbidarabs-sid", sid);
    }
    return sid;
  } catch {
    return "anon";
  }
}

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
    const sid = sessionId();
    let firstBeat = true;

    const beat = async () => {
      try {
        const r = await fetch("/api/visit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sid, count: firstBeat }),
        });
        firstBeat = false;
        const s = await r.json();
        // Trust the server's number as-is — DataFast zeros must show as 0
        // (only the initial server-rendered value may be stale).
        if (typeof s.online === "number") setOnline(s.online);
        if (typeof s.visitors === "number") setVisitors(s.visitors);
      } catch {
        /* offline */
      }
    };

    beat();
    const iv = setInterval(beat, 30_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <a
      target={ANALYTICS_URL ? "_blank" : undefined}
      rel={ANALYTICS_URL ? "noopener" : undefined}
      className="inline-block max-w-full rounded-full bg-muted px-3 py-1.5 text-center text-sm text-balance text-muted-foreground transition-colors hover:text-foreground"
      href={ANALYTICS_URL || "/about"}
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
