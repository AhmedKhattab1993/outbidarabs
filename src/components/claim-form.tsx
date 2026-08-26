"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/lang-context";
import { MIN_BID, MAX_BID } from "@/lib/i18n";
import { identityErrorMessages, normalizeIdentity } from "@/lib/identity";
import { HANDLE_CANDIDATES, detectPlatform, platformLabel, type Platform } from "@/lib/platforms";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import { EmailCodeForm } from "@/components/email-code-form";
import { PlatformIcon, PlatformBadge } from "@/components/platform-icon";
import { PlatformSelect } from "@/components/platform-select";
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

/** Outcome of a /api/checkout submission attempt. */
type SubmitOutcome = "redirected" | "gate" | "error";

/** A pay attempt parked behind the login gate — re-submitted verbatim after
 *  the email code verifies (no data re-entry, no extra click). */
type PendingPayment = { identity: string; platform: Platform; amount: number };

type PreviewState =
  | { kind: "ambiguous"; candidates: Platform[] }
  | { kind: "ok"; data: PreviewOk }
  | { kind: "error"; message: string }
  | null;

export function ClaimForm({ topBid }: { topBid: number }) {
  const { t, lang } = useLang();
  const { user, loading: authLoading, refresh } = useAuth();
  const [identity, setIdentity] = useState("");
  // Platform picked in the dropdown next to the input (used to resolve bare
  // handles). Full links override it via auto-detection below.
  const [platformChoice, setPlatformChoice] = useState<Platform>("instagram");
  const [preview, setPreview] = useState<PreviewState>(null);
  const [fetching, setFetching] = useState(false);
  const [amount, setAmount] = useState(String(topBid > 0 ? topBid + 1 : MIN_BID));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Pay-time login gate: the pending payment is stashed verbatim when a
  // logged-out visitor presses pay; verifying the email code auto-resumes it.
  const [gate, setGate] = useState<PendingPayment | null>(null);
  const [resuming, setResuming] = useState(false);
  const resumeLock = useRef(false);
  // True while a 401-triggered /api/auth/me re-check is in flight: a stale
  // client session must not auto-resume until the recheck settles.
  const refreshingSession = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const touched = useRef(false);
  const fetchSeq = useRef(0);

  const previewOk = preview?.kind === "ok" ? preview.data : null;

  // A full link always determines its own platform — the dropdown follows it
  // automatically (and locks). Bare handles use the dropdown's selection.
  const autoPlatform = useMemo(() => {
    const d = detectPlatform(identity.trim());
    return d.kind === "platform" ? d.platform : null;
  }, [identity]);
  const effectivePlatform = autoPlatform ?? platformChoice;

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
      // Bump the sequence so an in-flight fetch for the cleared input can't
      // pass the seq guard and resurrect the preview card.
      fetchSeq.current++;
      setPreview(null);
      setFetching(false);
      return;
    }

    // Instant client-side detection for immediate feedback
    const local = normalizeIdentity(v, effectivePlatform);
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
        params.set("platform", effectivePlatform);
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
  }, [identity, effectivePlatform]);

  // The card is ground truth from the platform (view-only), so the preview
  // only drives the suggested bid: raise → beat your own bid; otherwise beat
  // the top. The server independently re-derives the listing metadata.
  useEffect(() => {
    if (!previewOk || touched.current) return;
    const existing = previewOk.existing;
    const suggest = existing
      ? Math.max(existing.bid_amount + 1, previewOk.topBid + 1)
      : previewOk.topBid > 0
        ? previewOk.topBid + 1
        : MIN_BID;
    setAmount(String(Math.min(MAX_BID, suggest)));
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
  const fetchedNothing = previewOk != null && previewOk.meta == null && !previewOk.existing && !fetching;
  // Ground truth shown in the card: platform meta first, then the existing
  // listing, then the raw handle — never editable here.
  const gtTitle = previewOk?.meta?.title ?? existing?.display_name ?? previewOk?.displayName ?? "";
  const gtDescription = previewOk?.meta?.description ?? null;

  /** Submit a payment attempt to /api/checkout. Returns "redirected" when
   *  heading to the checkout URL, "gate" when a 401 parked the payment
   *  behind the inline login gate, "error" when it failed with the form
   *  error shown. */
  const submitCheckout = useCallback(
    async (p: PendingPayment, raise: boolean): Promise<SubmitOutcome> => {
      setLoading(true);
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ identity: p.identity, platform: p.platform, amount: p.amount }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.error === "login_required") {
            // Park the payment. The client session may be stale (signed out
            // in another tab, expired cookie) — revalidate it so the resume
            // effect stays parked until the email step delivers a real
            // login, instead of looping on the stale user.
            setGate(p);
            if (!refreshingSession.current) {
              refreshingSession.current = true;
              void refresh().finally(() => {
                refreshingSession.current = false;
              });
            }
            return "gate";
          }
          setError(data.error ?? identityErrorMessages("invalid", lang));
          return "error";
        }
        // One funnel event per real checkout (never on the pre-login 401
        // attempt) — fired before the navigation below.
        void trackEvent("checkout_started", { amount: p.amount, raise });
        // The success page polls this id until the webhook applies the payment
        // (mock mode skips polling).
        if (data.checkoutId) {
          try {
            sessionStorage.setItem("outbidarabs:checkout", String(data.checkoutId));
          } catch {
            /* private mode — polling simply won't know the id */
          }
        }
        window.location.href = data.url;
        return "redirected";
      } catch {
        setError(identityErrorMessages("invalid", lang));
        return "error";
      } finally {
        setLoading(false);
      }
    },
    [lang, refresh]
  );

  // Auto-resume: once the gated login succeeds (any path — the inline form
  // or the header modal) the parked payment is re-submitted automatically.
  // The lock keeps strict-mode double effects and repeat renders from firing
  // it twice; the session recheck guard parks (never loops) while a 401-
  // triggered /api/auth/me recheck is settling a stale client session; the
  // server's own idempotency is the final backstop.
  useEffect(() => {
    if (!gate || !user || resumeLock.current || refreshingSession.current) return;
    resumeLock.current = true;
    setResuming(true);
    void (async () => {
      const outcome = await submitCheckout(gate, !!existing);
      resumeLock.current = false;
      setResuming(false);
      // A redirect leaves the page. A re-401 keeps the gate parked (the
      // recheck re-presents the email step). Any other failure returns to
      // the form with the error shown — nothing is lost.
      if (outcome === "error") setGate(null);
    })();
  }, [gate, user, existing, submitCheckout]);

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
    // Pay-time gate: logged-out visitors swap to the inline email-code step
    // (their payment parks and auto-resumes on verify). Server enforces the
    // session too, so a stale client state can never pay anonymously.
    if (!user && !authLoading) {
      setGate({ identity, platform: effectivePlatform, amount: value });
      return;
    }
    await submitCheckout({ identity, platform: effectivePlatform, amount: value }, !!existing);
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
      {gate ? (
        /* ── Inline login gate: swap the form for the email-code step at the
            moment of commitment. The parked payment auto-resumes on verify;
            Back returns to the untouched form. ── */
        <div className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm md:p-5">
          <h2 className="text-center text-sm font-bold tracking-[-0.02em] text-pretty">
            {t.gateTitle}
          </h2>
          <p className="text-center text-xs leading-relaxed text-muted-foreground text-pretty">
            {t.gateBody}
          </p>
          {resuming || loading ? (
            <p className="py-2 text-center text-sm font-bold text-primary" role="status">
              {t.gateResuming}
            </p>
          ) : (
            <EmailCodeForm compact onDone={() => void refresh()} />
          )}
          <button
            type="button"
            onClick={() => setGate(null)}
            className="mx-auto cursor-pointer text-xs font-semibold text-muted-foreground hover:underline"
          >
            {t.back}
          </button>
        </div>
      ) : (
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        {/* ── Input with platform dropdown ── */}
        <div className="relative flex h-12 items-stretch rounded-2xl border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
          <PlatformSelect
            value={effectivePlatform}
            onChange={setPlatformChoice}
            lang={lang}
            disabled={loading || autoPlatform != null}
            autoDetected={autoPlatform != null}
            autoTitle={t.platformAutoFromLink}
          />
          <input
            id="identity"
            placeholder={t.inputPlaceholder[effectivePlatform]}
            autoComplete="off"
            spellCheck={false}
            required
            dir="ltr"
            aria-label={t.inputPlaceholder[effectivePlatform]}
            className="h-full min-w-0 flex-1 bg-transparent px-3 pe-10 text-center text-base outline-none placeholder:text-muted-foreground"
            value={identity}
            onChange={(e) => {
              setIdentity(e.target.value);
              setError(null);
            }}
            disabled={loading}
          />
          {fetching && (
            <span
              className="pointer-events-none absolute top-1/2 end-3 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-4 animate-spin">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
          )}
        </div>

        {/* ── Handle doesn't fit the picked platform / platform needs a URL ── */}
        {preview?.kind === "ambiguous" && (
          <p className="text-center text-xs leading-relaxed text-muted-foreground text-pretty">
            {HANDLE_CANDIDATES.includes(effectivePlatform)
              ? t.handleMismatch(effectivePlatform)
              : t.needsUrl(effectivePlatform)}
          </p>
        )}

        {/* ── Preview card: ground truth from the platform, view-only ── */}
        {previewOk && (
          <div className="rounded-2xl border bg-card p-3 shadow-sm md:p-4">
            <div className="flex items-start gap-3">
              <span className="relative shrink-0">
                <Avatar
                  name={gtTitle || previewOk.displayName}
                  url={previewOk.href}
                  src={previewOk.meta?.image ?? null}
                  className="size-14 bg-muted text-lg ring-1 ring-black/5 md:size-16 md:text-xl dark:ring-white/10"
                />
                <span className="absolute -bottom-1 -end-1">
                  <PlatformBadge
                    platform={previewOk.platform}
                    className="size-5 md:size-6"
                    title={platformLabel(previewOk.platform, lang)}
                  />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p
                  dir="auto"
                  title={gtTitle}
                  className="line-clamp-2 px-1.5 text-sm leading-snug font-bold md:text-base"
                >
                  {gtTitle || previewOk.displayName}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 px-1.5 text-[11px] text-muted-foreground md:text-xs">
                  <PlatformIcon platform={previewOk.platform} className="size-3" />
                  {previewOk.displayName} · {platformLabel(previewOk.platform, lang)}
                </p>
                <a
                  href={previewOk.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="mt-0.5 block truncate px-1.5 text-[11px] text-primary hover:underline md:text-xs"
                >
                  {previewOk.href.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </div>
            </div>

            {gtDescription && (
              <p
                dir="auto"
                title={gtDescription}
                className="mt-3 line-clamp-3 px-1.5 text-xs leading-relaxed text-muted-foreground md:text-sm"
              >
                {gtDescription}
              </p>
            )}

            <p className="mt-2.5 px-1.5 text-[11px] text-muted-foreground">
              {t.previewSourceNote}
            </p>

            {fetchedNothing && (
              <p className="mt-1.5 px-1.5 text-[11px] leading-relaxed text-muted-foreground">
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

        {/* ── Bid amount + CTA (centered under the input, matching the form) ── */}
        <div className="flex flex-col items-stretch justify-center gap-2 md:flex-row md:items-center">
          <div className="flex items-center justify-center gap-1.5">
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
            <label className="relative inline-block text-2xl font-bold tracking-[-0.03em] text-primary tabular-nums">
              <span className="sr-only">{t.amountDollars}</span>
              <span className="invisible whitespace-nowrap px-0.5" aria-hidden="true">
                ${amount || "0"}
              </span>
              <span className="absolute inset-0 flex items-baseline justify-center whitespace-nowrap">
                <span aria-hidden="true">$</span>
                <span className="relative inline-block">
                  {/* digit-sized sizer keeps the input exactly as wide as the
                      number, so the $ hugs the digits with no dead space */}
                  <span className="invisible" aria-hidden="true">
                    {amount || "0"}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="absolute inset-0 w-full bg-transparent p-0 text-center font-[inherit] text-[inherit] tracking-[inherit] tabular-nums outline-none"
                    value={amount}
                    onChange={(e) => {
                      touched.current = true;
                      setAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 6));
                    }}
                    disabled={loading}
                  />
                </span>
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
      )}
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
