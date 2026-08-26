"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import { formatUsd, timeAgo } from "@/lib/format";
import { EmailCodeForm } from "@/components/email-code-form";
import { UserAvatar } from "@/components/user-avatar";
import { Avatar } from "@/components/avatar";
import { PlatformBadge } from "@/components/platform-icon";
import type { PaymentsByCard, Profile } from "@/lib/accounts";

// Private profile (spec flow 4): avatar + name + public toggle (email
// read-only), payments grouped per card with the user's supporters rank.

type MeData = {
  email: string;
  profile: Profile | null;
  cards: PaymentsByCard[];
};

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // mirrors the bucket limit
const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Center-crop to a 256×256 square PNG (EXIF-rotated) — keeps payloads tiny
 *  and every avatar a consistent square. Falls back to the raw file when
 *  canvas decoding isn't available; the server re-validates regardless. */
async function squareAvatar(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    256,
    256
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("toBlob failed");
  return new File([blob], "avatar.png", { type: "image/png" });
}

export function ProfileClient() {
  const { t } = useLang();
  const { user, loading, refresh, signOut } = useAuth();
  const [data, setData] = useState<MeData | null>(null);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/me", { cache: "no-store" });
      if (!res.ok) return;
      const d: MeData = await res.json();
      setData(d);
      setName(d.profile?.display_name ?? "");
      setIsPublic(d.profile?.is_public ?? true);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: name, is_public: isPublic }),
      });
      setSavedAt(Date.now());
      refresh();
    } finally {
      setSaving(false);
    }
  }, [name, isPublic, refresh]);

  const pickAvatar = useCallback(
    async (file: File) => {
      setAvatarError(null);
      if (!AVATAR_TYPES.has(file.type)) {
        setAvatarError(t.avatarUnsupportedType);
        return;
      }
      if (file.size > AVATAR_MAX_BYTES) {
        setAvatarError(t.avatarTooLarge);
        return;
      }
      setAvatarBusy(true);
      try {
        let payload: File = file;
        try {
          payload = await squareAvatar(file);
        } catch {
          /* canvas decode unavailable → send the original (server re-validates) */
        }
        const form = new FormData();
        form.append("file", payload);
        const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
        if (!res.ok) {
          if (res.status === 413) setAvatarError(t.avatarTooLarge);
          else if (res.status === 415) setAvatarError(t.avatarUnsupportedType);
          else setAvatarError(t.avatarUploadFailed);
          return;
        }
        await Promise.all([refresh(), load()]); // header + supporters lists pick it up
      } catch {
        setAvatarError(t.avatarUploadFailed);
      } finally {
        setAvatarBusy(false);
      }
    },
    [t, refresh, load]
  );

  const removeAvatar = useCallback(async () => {
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (!res.ok) {
        setAvatarError(t.avatarUploadFailed);
        return;
      }
      await Promise.all([refresh(), load()]);
    } catch {
      setAvatarError(t.avatarUploadFailed);
    } finally {
      setAvatarBusy(false);
    }
  }, [t, refresh, load]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-sm">
        <p className="mb-4 text-center text-sm text-muted-foreground">{t.loginToSeeProfile}</p>
        <EmailCodeForm onDone={() => refresh()} />
      </div>
    );
  }

  const avatarUrl = data?.profile?.avatar_url ?? user.profile?.avatar_url ?? null;

  return (
    <div className="flex flex-col gap-6" dir="auto">
      {/* ── Identity card ── */}
      <div className="rounded-3xl border bg-card p-4 shadow-sm md:p-5">
        <div className="flex items-center gap-3">
          {/* Avatar: tap to upload (crop/resize to 256×256 client-side), × to remove */}
          <div className="relative shrink-0">
            <label
              className="relative block cursor-pointer"
              title={t.changePhoto}
              aria-label={t.changePhoto}
            >
              <UserAvatar
                userId={user.publicId ?? user.email}
                name={data?.profile?.display_name || user.email}
                src={avatarUrl}
                className="size-14 text-xl ring-1 ring-black/5 dark:ring-white/10"
              />
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // allow re-picking the same file
                  if (file) pickAvatar(file);
                }}
              />
            </label>
            {!avatarBusy && (
              <span className="pointer-events-none absolute -bottom-0.5 -end-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3">
                  <path
                    d="M4 8a2 2 0 0 1 2-2h1.6l1-1.6h6.8l1 1.6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="2" />
                </svg>
              </span>
            )}
            {avatarUrl && !avatarBusy && (
              <button
                type="button"
                onClick={removeAvatar}
                aria-label={t.removePhoto}
                title={t.removePhoto}
                className="absolute -top-1 -end-1 flex size-5 cursor-pointer items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-card transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3">
                  <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
            {avatarBusy && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <label className="block text-[11px] font-semibold text-muted-foreground">
              {t.profileNameLabel}
              <input
                dir="auto"
                maxLength={40}
                className="mt-0.5 h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm font-bold outline-none focus:border-ring dark:bg-input/30"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>
        </div>
        <p className="mt-3 truncate text-xs text-muted-foreground" dir="ltr">
          {t.profileEmailLabel}: <span className="font-semibold">{user.email}</span>
        </p>
        {avatarError && (
          <p className="mt-2 text-xs font-semibold text-destructive">{avatarError}</p>
        )}

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-muted/50 p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--primary)]"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          <span className="text-xs leading-relaxed">
            <span className="font-bold">{t.publicProfileToggle}</span>
            <br />
            <span className="text-muted-foreground">{t.publicProfileHint}</span>
          </span>
        </label>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={signOut}
            className="inline-flex h-9 cursor-pointer items-center rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-muted"
          >
            {t.signOut}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex h-9 cursor-pointer items-center rounded-full bg-primary px-5 text-xs font-bold text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
          >
            {Date.now() - savedAt < 2000 ? t.saved : saving ? "…" : t.save}
          </button>
        </div>
      </div>

      {/* ── My payments ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold tracking-[-0.02em]">{t.myPayments}</h2>
        {!data || data.cards.length === 0 ? (
          <p className="rounded-2xl border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
            {t.noPayments}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border bg-card">
            {data.cards.map((c) => (
              <li key={c.listing.id} className="border-t first:border-t-0">
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <span className="relative shrink-0">
                    <Avatar
                      name={c.listing.display_name}
                      url={c.listing.target_url || c.listing.url}
                      src={c.listing.image_url}
                      className="size-9 text-xs ring-1 ring-black/5 dark:ring-white/10"
                    />
                    <span className="absolute -bottom-0.5 -end-0.5">
                      <PlatformBadge platform={c.listing.platform} className="size-4" />
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="truncate text-xs font-bold">
                      {c.listing.display_name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t.timesPaid(c.count)} · {timeAgo(c.lastPaidAt, t)}
                      {c.rank != null && (
                        <>
                          {" · "}
                          <span className="font-bold text-primary">{t.rankOnCard(c.rank)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-primary tabular-nums">
                    {formatUsd(c.total)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
