"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang-context";
import { MIN_BID, MAX_BID } from "@/lib/i18n";
import { identityErrorMessages, normalizeIdentity } from "@/lib/identity";
import { platformLabel, type Platform } from "@/lib/platforms";
import { trackEvent } from "@/lib/analytics";
import { PlatformIcon, PlatformBadge } from "@/components/platform-icon";
import { Avatar } from "@/components/avatar";

const stepperBtn =
  "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-primary/15 text-lg font-bold text-primary transition-all outline-none select-none hover:bg-primary/25 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

const usd = (n: number) => "$" + n.toLocaleString("en-US");

type PreviewOk = {
  status: "ok";
  platform: Platform;
  url: string;
  href: string;
  displayName: string;
  meta: { title: string | null; description: string | null; image: string | null } | null;
  existing: { url: string; display_name: string; bid_amount: number; platform: Platform } | null;
  topBid: number;
};

type PreviewState =
  | { kind: "ambiguous"; candidates: Platform[] }
  | { kind: "ok"; data: PreviewOk }
  | { kind: "error"; message: string }
  | null;

export function ClaimForm({ topBid, topUrl }: { topBid: number; topUrl: string | null }) {
  const { t, lang } = useLang();
  const [identity, setIdentity] = useState("");
  const [platformChoice, setPlatformChoice] = useState<Platform | null>(null);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [fetching, setFetching] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [amount, setAmount] = useState(String(topBid > 0 ? topBid + 1 : MIN_BID));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dirty = useRef({ title: false, desc: false, image: false });
  const touched = useRef(false);
  const fetchSeq = useRef(0);

  const previewOk = preview?.kind === "ok" ? preview.data : null;

  // Keep the suggested #1 price in sync when the board changes and the user
  // hasn't touched the stepper yet (#1 = any bid above the current top).
  useEffect(() => {
    if (!touched.current) {
      setAmount(String(topBid > 0 ? topBid + 1 : MIN_BID));
    }
  }, [topBid]);

  // ── Detection + smart fetch (debounced) ──
  useEffect(() => {
    const v = identity.trim();
    if (!v) {
      setPreview(null);
      setFetching(false);
      return;
    }

    // Instant client-side detection for immediate feedback
    const local = normalizeIdentity(v, platformChoice ?? undefined);
    if (local.ok) {
      setPreview((prev) =>
        prev?.kind === "ok" && prev.data.url === local.url
          ? prev
          : { kind: "ok", data: placeholderPreview(local.url, local.href, local.display_name, local.platform, topBid) }
      );
    } else if (local.reason === "ambiguous") {
      setPreview({ kind: "ambiguous", candidates: local.candidates ?? [] });
    } else {
      setPreview(null);
    }

    const seq = ++fetchSeq.current;
    setFetching(true);
    const tm = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ identity: v });
        if (platformChoice) params.set("platform", platformChoice);
        const r = await fetch(`/api/preview?${params}`, { cache: "no-store" });
        if (!r.ok || seq !== fetchSeq.current) return;
        const d = await r.json();
        if (seq !== fetchSeq.current) return;
        if (d.status === "ok") {
          setPreview({ kind: "ok", data: d as PreviewOk });
        } else if (d.status === "ambiguous") {
          setPreview({ kind: "ambiguous", candidates: d.candidates ?? [] });
        } else if (d.status === "error") {
          setPreview({ kind: "error", message: identityErrorMessages(d.reason ?? "invalid", lang) });
        }
      } catch {
        /* offline — keep the client-side detection above */
      } finally {
        if (seq === fetchSeq.current) setFetching(false);
      }
    }, 450);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, platformChoice]);

  // Fill editable fields from the fetched preview (never overwrite user edits)
  const lastUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!previewOk) return;
    if (lastUrl.current !== previewOk.url) {
      dirty.current = { title: false, desc: false, image: false };
      lastUrl.current = previewOk.url;
    }
    const fallbackTitle =
      previewOk.meta?.title ?? previewOk.existing?.display_name ?? previewOk.displayName;
    const fallbackDesc = previewOk.meta?.description ?? "";
    const fallbackImage = previewOk.meta?.image ?? "";
    if (!dirty.current.title) setTitle(fallbackTitle || previewOk.displayName);
    if (!dirty.current.desc) setDescription(fallbackDesc);
    if (!dirty.current.image) setImageUrl(fallbackImage);

    // Suggest: raise → beat your own bid; otherwise beat the top.
    if (!touched.current) {
      const existing = previewOk.existing;
      const suggest = existing
        ? Math.max(existing.bid_amount + 1, previewOk.topBid + 1)
        : previewOk.topBid > 0
          ? previewOk.topBid + 1
          : MIN_BID;
      setAmount(String(Math.min(MAX_BID, suggest)));
    }
  }, [previewOk]);

  // "claim this rank for $X" buttons on the board
  useEffect(() => {
    const onClaim = (e: Event) => {
      const detail = (e as CustomEvent<{ amount: number }>).detail;
      touched.current = true;
      setAmount(String(detail.amount));
      document.getElementById("claim")?.scrollIntoView({ behavior: "smooth", block: "center" });
      inputRef.current?.focus();
    };
    window.addEventListener("outbidarabs:claim", onClaim);
    return () => window.removeEventListener("outbidarabs:claim", onClaim);
  }, []);

  const clamp = useCallback((n: number) => Math.min(MAX_BID, Math.max(MIN_BID, n)), []);

  const value = parseInt(amount, 10) || 0;
  const existing = previewOk?.existing ?? null;
  const diff = existing && value > existing.bid_amount ? value - existing.bid_amount : 0;
  const detectedPlatform = previewOk?.platform ?? null;
  const fetchedNothing = previewOk != null && previewOk.meta == null && !fetching;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!previewOk) {
      setError(identityErrorMessages(identity.trim() ? "invalid" : "empty", lang));
      return;
    }
    if (!Number.isFinite(value) || value < MIN_BID) {
      setError(identityErrorMessages("too-low", lang));
      return;
    }
    if (value > MAX_BID) {
      setError(identityErrorMessages("over-max", lang));
      return;
    }
    if (existing && value <= existing.bid_amount) {
      setError(
        lang === "ar"
          ? `هذه القائمة بسعر ${usd(existing.bid_amount)} بالفعل — ارفع سعرك بدولار واحد على الأقل`
          : `This listing is already at ${usd(existing.bid_amount)} — raise your bid by at least $1`
      );
      return;
    }
    setLoading(true);
    trackEvent("checkout_started", { amount: value, raise: !!existing });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identity,
          platform: platformChoice ?? detectedPlatform ?? undefined,
          amount: value,
          title: title || undefined,
          description: description || undefined,
          imageUrl: imageUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? identityErrorMessages("invalid", lang));
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(identityErrorMessages("invalid", lang));
    } finally {
      setLoading(false);
    }
  };

  const ctaLabel = loading
    ? "…"
    : existing && diff > 0
      ? t.payMore(diff)
      : previewOk
        ? t.outbid
        : t.reserveSpot;

  return (
    <section id="claim" className="scroll-mt-6">
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        {/* ── Single input ── */}
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute top-1/2 start-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {detectedPlatform ? (
              <PlatformIcon platform={detectedPlatform} className="size-4" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </span>
          <input
            id="identity"
            placeholder={t.placeholder}
            autoComplete="off"
            spellCheck={false}
            required
            dir="ltr"
            className="h-12 w-full min-w-0 rounded-2xl border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 ps-12"
            value={identity}
            onChange={(e) => {
              setIdentity(e.target.value);
              setPlatformChoice(null);
              setError(null);
            }}
            disabled={loading}
          />
          {fetching && (
            <span className="absolute top-1/2 end-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" className="size-4 animate-spin">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
          )}
        </div>

        {/* ── Ambiguity: platform selector chips ── */}
        {preview?.kind === "ambiguous" && (
          <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-3">
            <p className="mb-2 text-center text-xs font-semibold text-foreground">
              {t.choosePlatform}
            </p>
            <div className="flex items-center justify-center gap-2">
              {preview.candidates.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatformChoice(p)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3.5 py-2 text-xs font-bold text-foreground transition-colors hover:border-primary hover:bg-primary/10"
                >
                  <PlatformIcon platform={p} className="size-4" />
                  {platformLabel(p, lang)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Preview card ── */}
        {previewOk && (
          <div className="rounded-2xl border bg-card p-3 shadow-sm md:p-4" dir="auto">
            <div className="flex items-start gap-3">
              <span className="relative shrink-0">
                <Avatar
                  name={title || previewOk.displayName}
                  url={previewOk.href}
                  src={imageUrl || null}
                  className="size-14 bg-muted text-lg ring-1 ring-black/5 md:size-16 md:text-xl dark:ring-white/10"
                />
                <span className="absolute -bottom-1 -end-1">
                  <PlatformBadge platform={previewOk.platform} />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor="preview-title">
                  {t.titleLabel}
                </label>
                <input
                  id="preview-title"
                  value={title}
                  onChange={(e) => {
                    dirty.current.title = true;
                    setTitle(e.target.value.slice(0, 60));
                  }}
                  placeholder={t.titlePlaceholder}
                  className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-bold outline-none hover:border-input focus:border-ring focus:ring-3 focus:ring-ring/30 md:text-base"
                  disabled={loading}
                />
                <p className="mt-0.5 flex items-center gap-1.5 px-1.5 text-[11px] text-muted-foreground">
                  <PlatformIcon platform={previewOk.platform} className="size-3" />
                  {previewOk.displayName} · {platformLabel(previewOk.platform, lang)}
                </p>
                <a
                  href={previewOk.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="mt-0.5 block truncate px-1.5 text-[11px] text-primary hover:underline"
                >
                  {previewOk.href.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </div>
            </div>

            <label className="sr-only" htmlFor="preview-desc">
              {t.descriptionLabel}
            </label>
            <textarea
              id="preview-desc"
              value={description}
              onChange={(e) => {
                dirty.current.desc = true;
                setDescription(e.target.value.slice(0, 150));
              }}
              placeholder={t.descriptionPlaceholder}
              rows={2}
              className="mt-3 w-full resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-xs leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              disabled={loading}
            />
            <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground/80">
              <span>{t.previewEditableNote}</span>
              <span className="tabular-nums">{description.length}/150</span>
            </div>

            <details className="mt-2 px-1 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer font-medium hover:text-foreground">
                {t.imageLabel}
              </summary>
              <input
                type="url"
                dir="ltr"
                value={imageUrl}
                onChange={(e) => {
                  dirty.current.image = true;
                  setImageUrl(e.target.value);
                }}
                placeholder="https://…"
                className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-[11px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={loading}
              />
            </details>

            {fetchedNothing && (
              <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
                {t.fetchFailedNote}
              </p>
            )}
            {existing && (
              <p className="mt-2 rounded-xl bg-primary/10 px-3 py-2 text-center text-xs font-semibold leading-relaxed text-primary text-pretty">
                {diff > 0
                  ? t.alreadyOnBoardAt(existing.bid_amount, diff)
                  : lang === "ar"
                    ? `موجود على اللوحة بسعر ${usd(existing.bid_amount)} — زايد أعلى منه`
                    : `On the board at ${usd(existing.bid_amount)} — bid above it`}
              </p>
            )}
          </div>
        )}

        {/* ── Bid amount + CTA ── */}
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label={t.decreaseBid}
              className={stepperBtn}
              onClick={() => {
                touched.current = true;
                setAmount(String(clamp((parseInt(amount || "0", 10) || 0) - 1)));
              }}
              disabled={loading}
            >
              −
            </button>
            <label className="relative inline-block min-w-24 text-2xl font-bold tracking-[-0.03em] text-primary tabular-nums">
              <span className="sr-only">{t.amountDollars}</span>
              <span className="invisible whitespace-nowrap px-1" aria-hidden="true">
                ${amount || "0"}
              </span>
              <span className="absolute inset-0 flex items-baseline justify-center">
                <span aria-hidden="true">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-full min-w-0 bg-transparent p-0 text-center font-[inherit] text-[inherit] tracking-[inherit] tabular-nums outline-none"
                  value={amount}
                  onChange={(e) => {
                    touched.current = true;
                    setAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 6));
                  }}
                  disabled={loading}
                />
              </span>
            </label>
            <button
              type="button"
              aria-label={t.increaseBid}
              className={stepperBtn}
              onClick={() => {
                touched.current = true;
                setAmount(String(clamp((parseInt(amount || "0", 10) || 0) + 1)));
              }}
              disabled={loading}
            >
              +
            </button>
          </div>
          <button
            type="submit"
            disabled={loading || !identity.trim() || !previewOk}
            className="inline-flex h-12 w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-transparent bg-primary px-6 text-sm font-bold whitespace-nowrap text-primary-foreground transition-all outline-none select-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
          >
            {ctaLabel}
          </button>
        </div>

        {error && (
          <p className="text-center text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        )}

        <p className="text-center text-xs leading-relaxed text-muted-foreground text-pretty">
          <span className="font-semibold text-primary/80">
            {t.startsFrom} ${MIN_BID}.
          </span>{" "}
          {topBid > 0 ? t.top1Hint(topBid + 1) : t.boardEmptyCta}
        </p>
        <p className="text-center text-xs leading-relaxed text-muted-foreground/80 text-pretty">
          {t.alreadyOnList}
        </p>
      </form>
    </section>
  );
}

function placeholderPreview(
  url: string,
  href: string,
  displayName: string,
  platform: Platform,
  topBid: number
): PreviewOk {
  return {
    status: "ok",
    platform,
    url,
    href,
    displayName,
    meta: null,
    existing: null,
    topBid,
  };
}
