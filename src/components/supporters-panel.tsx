"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import { formatUsd } from "@/lib/format";
import type { CardState, Supporter } from "@/lib/accounts";
import { UserAvatar } from "@/components/user-avatar";

// Card drawer (D9): the card's ranked supporters list. Private users appear
// as Anonymous (D8) — amounts always visible. The visit action stays /go/[id]
// on the row itself; this panel is a separate surface. Cards are agnostic —
// no ownership actions here, just the ranking of who paid.

export function SupportersPanel({ listingId }: { listingId: string }) {
  const { t } = useLang();
  const { user } = useAuth();
  const [state, setState] = useState<CardState | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${listingId}`, { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch {
      /* offline — keep whatever we have */
    }
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  const supporters = state?.supporters ?? [];

  return (
    <div className="border-t px-3 py-3 md:px-4 md:py-4" dir="auto">
      {/* ── Ranked supporters ── */}
      <h4 className="mb-1.5 text-center text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        {t.supporters} · {t.supportersCount(supporters.length)}
      </h4>
      {supporters.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">{t.noSupporters}</p>
      ) : (
        <ul>
          {supporters.map((s, i) => (
            <SupporterRow key={s.key} rank={i + 1} s={s} isYou={!!user && !!s.publicId && s.publicId === user.publicId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SupporterRow({ rank, s, isYou }: { rank: number; s: Supporter; isYou: boolean }) {
  const { t } = useLang();
  const named = !!s.name;
  const content = (
    <>
      <span className="w-6 shrink-0 text-center text-[11px] font-bold text-muted-foreground tabular-nums">
        {rank}
      </span>
      <UserAvatar userId={s.publicId ?? s.key} name={s.name} className="size-7 text-xs" />
      <span
        dir="auto"
        className={
          "min-w-0 flex-1 truncate text-xs " +
          (named ? "font-semibold" : "text-muted-foreground")
        }
      >
        {named ? s.name : t.anonymous}
        {isYou && <span className="ms-1 text-primary">({t.youLabel})</span>}
      </span>
      <span className="shrink-0 text-xs font-semibold text-primary tabular-nums">
        {formatUsd(s.total)}
      </span>
    </>
  );
  return (
    <li className="border-t first:border-t-0">
      {named && s.publicId ? (
        <Link href={`/u/${s.publicId}`} className="flex min-h-10 items-center gap-2 py-1.5 hover:underline">
          {content}
        </Link>
      ) : (
        <span className="flex min-h-10 items-center gap-2 py-1.5">{content}</span>
      )}
    </li>
  );
}
