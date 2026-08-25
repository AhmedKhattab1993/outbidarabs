"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import { formatUsd } from "@/lib/format";
import type { CardState, Supporter } from "@/lib/accounts";
import { UserAvatar } from "@/components/user-avatar";

// Card drawer (D9): the card's ranked supporters list + ownership actions.
// Private users appear as Anonymous (D8) — amounts always visible. The visit
// action stays /go/[id] on the row itself; this panel is a separate surface.

type EditState = { description: string; imageUrl: string } | null;

export function SupportersPanel({ listingId, onClaimed }: { listingId: string; onClaimed?: () => void }) {
  const { t } = useLang();
  const { user, openLogin } = useAuth();
  const [state, setState] = useState<CardState | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimOk, setClaimOk] = useState(false);
  const [edit, setEdit] = useState<EditState>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editOk, setEditOk] = useState(false);

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

  const claim = useCallback(async () => {
    setClaimError(null);
    setClaiming(true);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (res.ok) {
        setClaimOk(true);
        onClaimed?.();
        await load();
      } else if (res.status === 409) {
        setClaimError(t.claimExists(data.ownerName ?? null));
        await load();
      } else {
        setClaimError(t.claimFailed);
      }
    } catch {
      setClaimError(t.claimFailed);
    } finally {
      setClaiming(false);
    }
  }, [listingId, load, onClaimed, t]);

  const claimWithLogin = useCallback(() => {
    if (user) {
      claim();
      return;
    }
    openLogin({ onDone: () => void claim() });
  }, [user, openLogin, claim]);

  const saveEdit = useCallback(async () => {
    if (!edit) return;
    setEditError(null);
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/cards/${listingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: edit.description || null, image_url: edit.imageUrl || null }),
      });
      if (res.ok) {
        setEditOk(true);
        setEdit(null);
        window.location.reload(); // board rows show description/image live
        return;
      }
      let errorBody: string | null = null;
      try {
        errorBody = ((await res.json()) as { error?: string }).error ?? null;
      } catch {
        /* non-JSON body */
      }
      if (res.status === 400 && errorBody === "invalid_image_url") {
        setEditError(t.invalidImageUrl);
      } else if (res.status === 401) {
        // Expired mock/dev session — the edit itself is fine.
        setEditError(t.editRelogin);
      } else {
        setEditError(t.editFailed);
      }
    } catch {
      setEditError(t.editFailed);
    } finally {
      setSavingEdit(false);
    }
  }, [edit, listingId, t]);

  const owner = state?.owner ?? null;
  const isOwner = !!user && !!owner?.publicId && owner.publicId === user.publicId;
  const supporters = state?.supporters ?? [];

  return (
    <div className="border-t px-3 py-3 md:px-4 md:py-4" dir="auto">
      {/* ── Owner / claim row ── */}
      {claimOk ? (
        <p className="mb-3 text-center text-xs font-bold text-primary" role="status">
          {t.claimDone}
        </p>
      ) : owner ? (
        <div className="mb-3 flex min-h-9 flex-wrap items-center justify-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-bold text-primary">
            <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden="true">
              <path
                d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8L12 3z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            {t.claimedBadge}
          </span>
          <span className="text-muted-foreground">
            {t.ownerLabel}:{" "}
            {owner.name && owner.publicId ? (
              <Link href={`/u/${owner.publicId}`} className="font-semibold text-foreground hover:underline">
                {owner.name}
              </Link>
            ) : (
              <span className="font-semibold">{t.anonymous}</span>
            )}
          </span>
        </div>
      ) : (
        <div className="mb-3 text-center">
          <button
            type="button"
            onClick={claimWithLogin}
            disabled={claiming}
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-4 text-xs font-bold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            {claiming ? "…" : t.claimCard}
          </button>
          {!user && <p className="mt-1.5 text-[11px] text-muted-foreground">{t.claimLoginHint}</p>}
          {claimError && (
            <p className="mt-1.5 text-[11px] font-medium text-destructive" role="alert">
              {claimError}
            </p>
          )}
        </div>
      )}

      {/* ── Owner edit (D6: description + image; URL immutable) ── */}
      {isOwner && !claimOk && (
        <div className="mb-3">
          {edit ? (
            <div className="flex flex-col gap-2 rounded-2xl border bg-muted/40 p-3">
              <label className="text-[11px] font-semibold text-muted-foreground">
                {t.descriptionLabel}
                <textarea
                  dir="auto"
                  rows={2}
                  maxLength={280}
                  className="mt-1 w-full rounded-xl border border-input bg-transparent p-2 text-xs outline-none focus:border-ring"
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </label>
              <label className="text-[11px] font-semibold text-muted-foreground">
                {t.imageLabel}
                <input
                  type="url"
                  dir="ltr"
                  placeholder="https://…"
                  className="mt-1 h-9 w-full rounded-xl border border-input bg-transparent px-2 text-xs outline-none focus:border-ring"
                  value={edit.imageUrl}
                  onChange={(e) => setEdit({ ...edit, imageUrl: e.target.value })}
                />
              </label>
              {editError && (
                <p className="text-[11px] font-medium text-destructive" role="alert">
                  {editError}
                </p>
              )}
              <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                {t.editClearHint}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEdit(null)}
                  className="inline-flex h-8 cursor-pointer items-center rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="inline-flex h-8 cursor-pointer items-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
                >
                  {savingEdit ? "…" : t.save}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              // Prefill with the card's current values so saving untouched
              // fields can't wipe them (explicit empty = clear, hinted above).
              onClick={() =>
                setEdit({
                  description: state?.card?.description ?? "",
                  imageUrl: state?.card?.imageUrl ?? "",
                })
              }
              className="mx-auto block cursor-pointer text-[11px] font-semibold text-primary hover:underline"
            >
              {editOk ? t.saved : t.editCard}
            </button>
          )}
        </div>
      )}

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
        {s.isOwner && (
          <span className="ms-1.5 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold text-primary">
            {t.ownerLabel}
          </span>
        )}
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
