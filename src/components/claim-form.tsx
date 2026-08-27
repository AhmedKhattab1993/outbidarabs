"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/lang-context";
import { MIN_BID, MAX_BID } from "@/lib/i18n";
import { identityErrorMessages, normalizeIdentity } from "@/lib/identity";
import { HANDLE_CANDIDATES, detectPlatform, platformLabel, type Platform } from "@/lib/platforms";
import { trackEvent } from "@/lib/analytics";
import { tiktokTrack } from "@/lib/tiktok";
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
  // Instagram enrichment runs as a background job (Pattern B): "pending"
  // means a lease is live and the row will fill — keep polling. "failed"
  // with meta == null is terminal for this session (backoff/cooldown).
  fetchStatus?: "ok" | "pending" | "failed";
  existing: { url: string; display_name: string; bid_amount: number; platform: Platform } | null;
  topBid: number;
};

/** Outcome of a /api/checkout submission attempt. */
type SubmitOutcome = "redirected" | "gate" | "error";

/** A pay attempt parked behind the login gate — re-submitted verbatim after
 *  the email code verifies (no data re-entry, no extra click). */
type PendingPayment = {
  identity: string;
  platform: Platform;
  amount: number;
  display_name?: string;
};

type PreviewState =
  | { kind: "ambiguous"; candidates: Platform[] }
  | { kind: "ok"; data: PreviewOk }
  | { kind: "error"; message: string }
  | null;

export function ClaimForm({ bids }: { bids: number[] }) {
  const { t, lang } = useLang();
  const { user, loading: authLoading, refresh } = useAuth();
  const [identity, setIdentity] = useState("");
  // Platform picked in the dropdown next to the input (used to resolve bare
  // handles). Full links override it via auto-detection below.
  const [platformChoice, setPlatformChoice] = useState<Platform>("instagram");
  const [preview, setPreview] = useState<PreviewState>(null);
  const [fetching, setFetching] = useState(false);
  // Active board bids sorted desc — the source of every rank calculation here.
  const topBid = bids[0] ?? 0;
  const [amount, setAmount] = useState(String(topBid > 0 ? topBid + 1 : MIN_BID));
  // `amount` is always what the visitor PAYS: the full bid for a new card,
  // or just the raise delta for a card already on the board (the resulting
  // total is derived below — the checkout API still receives the total).
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
  const amountRef = useRef<HTMLInputElement>(null);
  const touched = useRef(false);
  const fetchSeq = useRef(0);
  // Instagram enrichment is a background job: when the preview answers
  // fetchStatus "pending" we re-run the fetch on a backoff schedule until
  // the row lands (ok) or the session gives up (failed). The nonce just
  // re-triggers the debounce effect; per-URL attempt counts live in a ref.
  const [pollNonce, setPollNonce] = useState(0);
  const pollAttempts = useRef(new Map<string, number>());
  // Backoff schedule covering the full job worst case: endpoint surface
  // (~28s) → page surface (~15s) → avatar (~10s) can legitimately reach ~55s
  // inside the 75s lease; polls stop only after that. Cumulative ≈ 68s.
  const POLL_SCHEDULE = [1500, 3000, 5000, 8000, 12000, 17000, 10000, 12000];
  // True when the poll schedule ran out while still pending — the slow note
  // takes over from the spinner (a late row serves on any later refetch).
  const [igExhausted, setIgExhausted] = useState(false);

  const previewOk = preview?.kind === "ok" ? preview.data : null;

  // A full link always determines its own platform — the dropdown follows it
  // automatically (and locks). Bare handles use the dropdown's selection.
  const autoPlatform = useMemo(() => {
    const d = detectPlatform(identity.trim());
    return d.kind === "platform" ? d.platform : null;
  }, [identity]);
  const effectivePlatform = autoPlatform ?? platformChoice;

  // Keep the suggested #1 price in sync when the board changes and the user
  // hasn't touched the stepper yet (#1 = any bid above the current top). A
  // card already in preview keeps its own suggestion — the one-level-up
  // delta from the previewOk effect below — since a raise's pay amount is
  // not the #1 price.
  useEffect(() => {
    if (!touched.current && !previewOk?.existing) {
      setAmount(String(topBid > 0 ? topBid + 1 : MIN_BID));
    }
  }, [topBid, previewOk]);

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
      setIgExhausted(false); // fresh paste — the poll budget resets
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
          // Poll while the enrichment job holds the lease: each re-fetch
          // reads the meta_cache row (and re-claims it if the last run
          // failed inside its backoff window). Never more than the schedule
          // per pasted profile.
          const ok = d as PreviewOk;
          const noMeta = !ok.meta && !ok.existing;
          if (ok.platform === "instagram" && noMeta && ok.fetchStatus === "pending") {
            const attempts = pollAttempts.current.get(ok.url) ?? 0;
            if (attempts < POLL_SCHEDULE.length) {
              pollAttempts.current.set(ok.url, attempts + 1);
              setTimeout(() => setPollNonce((n) => n + 1), POLL_SCHEDULE[attempts]);
            } else {
              setIgExhausted(true);
            }
          }
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
  }, [identity, effectivePlatform, pollNonce]);

  // The card is ground truth from the platform (view-only), so the preview
  // only drives the suggested bid. A card already on the board defaults to
  // the delta that lifts it one level up (beating the smallest at-or-above
  // bid — under ties that can jump several ranks); #1 defaults to +$1 on
  // the lead. New cards default to beating the top. The server
  // independently re-derives the listing metadata.
  useEffect(() => {
    if (!previewOk || touched.current) return;
    const existing = previewOk.existing;
    let suggest: number;
    if (existing) {
      const above = bids.filter((b) => b >= existing.bid_amount);
      suggest = above.length > 1 ? above[above.length - 2] + 1 - existing.bid_amount : 1;
    } else {
      suggest = previewOk.topBid > 0 ? previewOk.topBid + 1 : MIN_BID;
    }
    setAmount(String(Math.min(MAX_BID, Math.max(1, suggest))));
  }, [previewOk, bids]);

  // "boost it ↑ for $X" buttons on the board: prefill the exact card
  // (identity = its canonical URL, so platform auto-detects and the preview
  // lands in the pay-the-difference state) plus the delta that lifts it one
  // level up. The amount field keeps the focus — it's the one decision left.
  useEffect(() => {
    const onBoost = (e: Event) => {
      const detail = (e as CustomEvent<{ pay: number; url?: string }>).detail;
      touched.current = true;
      setAmount(String(Math.min(MAX_BID, Math.max(1, detail.pay))));
      if (detail.url) {
        setIdentity(detail.url);
        setError(null);
      }
      document.getElementById("claim")?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (detail.url) amountRef.current?.focus();
      else inputRef.current?.focus();
    };
    window.addEventListener("outbidarabs:boost", onBoost);
    return () => window.removeEventListener("outbidarabs:boost", onBoost);
  }, []);

  // Deep-linked boost (?boost=<card url>&pay=<delta>#claim): the about page's
  // "Back a creator" lands here with the exact card prefilled — same state as
  // the board's boost buttons, just across a navigation. Params are stripped
  // after applying so refreshes and shares stay clean.
  const appliedDeepLink = useRef(false);
  useEffect(() => {
    if (appliedDeepLink.current) return;
    const params = new URLSearchParams(window.location.search);
    const boost = params.get("boost");
    if (!boost) return;
    appliedDeepLink.current = true;
    const pay = parseInt(params.get("pay") ?? "", 10);
    touched.current = true;
    setIdentity(boost);
    setError(null);
    // A valid pay delta wins; otherwise fall back to beating the current #1.
    const fallback = bids[0] > 0 ? bids[0] + 1 : MIN_BID;
    setAmount(String(Math.min(MAX_BID, Math.max(MIN_BID, Number.isFinite(pay) && pay > 0 ? pay : fallback))));
    const clean = new URL(window.location.href);
    clean.searchParams.delete("boost");
    clean.searchParams.delete("pay");
    window.history.replaceState(null, "", clean.toString());
    const tm = setTimeout(
      () => document.getElementById("claim")?.scrollIntoView({ behavior: "smooth", block: "center" }),
      80
    );
    return () => clearTimeout(tm);
    // Runs once on mount — `bids` read from initial server-fetched props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = parseInt(amount, 10) || 0; // what the visitor pays
  const existing = previewOk?.existing ?? null;
  // Resulting total bid after payment — what the board ranks and the
  // checkout API receives (the server charges `value` for raises).
  const total = existing ? existing.bid_amount + value : value;

  // The pay amount stays within [MIN_BID, MAX_BID] — and, when raising an
  // existing card, within what its total can legally reach.
  const clamp = useCallback(
    (n: number) => {
      const cap = existing ? MAX_BID - existing.bid_amount : MAX_BID;
      return Math.max(MIN_BID, Math.min(cap >= MIN_BID ? cap : MIN_BID, n));
    },
    [existing]
  );

  // ── Live rank preview: what spot does `total` buy after payment? ──
  // Ties lose to the earlier payer (board sorts by bid desc, last_bid_at
  // asc), so count every bid >= total — not just those strictly above. An
  // equal bid never dislodges the sitting holder.
  const atOrAbove = total >= MIN_BID ? bids.filter((b) => b >= total) : [];
  const projectedRank = total >= MIN_BID ? atOrAbove.length + 1 : 0;
  // Cheapest bump that gains a rank: beat the smallest bid at-or-above total.
  // Under ties that price can jump more than one rank (beating one 99 beats
  // every 99) — re-derive where it actually lands for the upsell label.
  const nextRankPrice = projectedRank > 1 ? atOrAbove[atOrAbove.length - 1] + 1 : 0;
  const nextRankUp =
    nextRankPrice > total ? 1 + bids.filter((b) => b >= nextRankPrice).length : 0;
  const rankMedal = { 1: "🥇", 2: "🥈", 3: "🥉" }[projectedRank as 1 | 2 | 3] ?? "";

  // Quick-pick chips: each top-3 level at the exact delta it costs — the
  // full price for a new card, or just the raise difference for a card
  // already on the board (only the delta ever appears). A price that lands
  // on a different rank (again: ties) isn't offered — a "#2" chip must
  // really take #2 — and levels at or below the card's own bid cost
  // nothing, so they're filtered out (holding a level tops up +$1 only
  // when that genuinely beats a tie above it).
  const rankChips = useMemo(() => {
    const chips: Array<{ rank: number; pay: number }> = [];
    for (let k = 1; k <= 3 && k <= bids.length; k++) {
      const price = bids[k - 1] + 1;
      if (price > MAX_BID) break;
      if (1 + bids.filter((b) => b >= price).length !== k) continue;
      const pay = existing ? price - existing.bid_amount : price;
      if (pay >= MIN_BID) chips.push({ rank: k, pay });
    }
    return chips;
  }, [bids, existing]);

  // Instagram enrichment states for the preview note: actively polling →
  // "fetching…" spinner; polls exhausted but still pending → honest slow
  // note; fetchStatus failed → terminal fallback note (job gave up).
  const igPending =
    !!previewOk &&
    previewOk.platform === "instagram" &&
    !previewOk.existing &&
    !previewOk.meta &&
    previewOk.fetchStatus === "pending" &&
    !igExhausted;
  const igSlow =
    !!previewOk &&
    previewOk.platform === "instagram" &&
    !previewOk.existing &&
    !previewOk.meta &&
    previewOk.fetchStatus === "pending" &&
    igExhausted &&
    !fetching;
  const fetchedNothing =
    !!previewOk &&
    previewOk.platform === "instagram" &&
    !previewOk.existing &&
    !previewOk.meta &&
    previewOk.fetchStatus === "failed" &&
    !fetching;
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
          body: JSON.stringify({
            identity: p.identity,
            platform: p.platform,
            amount: p.amount,
            display_name: p.display_name,
          }),
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
        // (mock mode skips polling). The TikTok dedup id lets its CompletePayment
        // pixel event match the webhook's Events API event 1:1.
        if (data.checkoutId) {
          try {
            sessionStorage.setItem("outbidarabs:checkout", String(data.checkoutId));
            if (data.eventId) sessionStorage.setItem("outbidarabs:ttx", String(data.eventId));
          } catch {
            /* private mode — polling simply won't know the id */
          }
        }
        // TikTok standard event, awaited so its beacon is queued before the
        // redirect starts (fire-and-forget here loses events to navigation).
        // The ~400ms grace lets the SDK flush before leaving for Dodo.
        await tiktokTrack("InitiateCheckout", {
          content_id: "leaderboard_bid",
          content_name: raise ? "raise_bid" : "new_bid",
          value: p.amount,
          currency: "USD",
        }).catch(() => {});
        setTimeout(() => { window.location.href = data.url; }, 400);
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
    if (total > MAX_BID) {
      setError(identityErrorMessages("over-max", lang));
      return;
    }
    // A raise always clears the sitting total here (pay ≥ $1 ⇒ total > old
    // bid); if the board moved since the preview, the server re-checks and
    // answers with the raise-above message.
    // Pay-time gate: logged-out visitors swap to the inline email-code step
    // (their payment parks and auto-resumes on verify). Server enforces the
    // session too, so a stale client state can never pay anonymously.
    if (!user && !authLoading) {
      setGate({
        identity,
        platform: effectivePlatform,
        amount: total,
      });
      return;
    }
    await submitCheckout(
      {
        identity,
        platform: effectivePlatform,
        amount: total,
      },
      !!existing
    );
  };

  // The CTA always quotes the delta: "boost it for $X" when raising (X =
  // the pay amount), the plain outbid/reserve price for new cards.
  const ctaLabel = loading
    ? "…"
    : existing
      ? value >= MIN_BID
        ? t.payMore(value)
        : t.outbid
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

            {igPending && (
              <p className="mt-1.5 px-1.5 flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <svg viewBox="0 0 24 24" fill="none" className="size-3 animate-spin" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path d="M21 12a9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                {t.fetchPendingNote}
              </p>
            )}
            {igSlow && !igPending && (
              <p className="mt-1.5 px-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {t.fetchSlowNote}
              </p>
            )}
            {fetchedNothing && (
              <p className="mt-1.5 px-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {t.fetchFailedNote}
              </p>
            )}
            {existing && (
              <p className="mt-2 rounded-xl bg-primary/10 px-3 py-2 text-center text-xs font-semibold leading-relaxed text-primary text-pretty">
                {value >= MIN_BID
                  ? t.alreadyOnBoardAt(existing.bid_amount, value)
                  : t.onBoardNoDiff(existing.bid_amount)}
              </p>
            )}
          </div>
        )}

        {/* ── Quick level picks: the exact delta each top-3 spot costs, one tap ── */}
        {rankChips.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {rankChips.map((c) => (
              <button
                key={c.rank}
                type="button"
                onClick={() => {
                  touched.current = true;
                  setAmount(String(c.pay));
                }}
                disabled={loading}
                aria-label={t.takeRankFor(c.rank, c.pay)}
                className={
                  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 " +
                  (value === c.pay
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-input text-muted-foreground hover:border-primary/40 hover:text-primary")
                }
              >
                #{c.rank}
                <span className="text-primary tabular-nums">{usd(c.pay)}</span>
              </button>
            ))}
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
            {/* A real, visibly editable field — the ± steppers are fine-tuning,
                not the only way in. Selects all on focus so a fresh amount is
                one tap + type away. */}
            <label className="flex h-12 min-w-0 flex-1 cursor-text items-center justify-center gap-0.5 rounded-2xl border border-input bg-transparent px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 md:flex-none md:w-52 dark:bg-input/30">
              <span aria-hidden="true" className="text-2xl font-bold text-primary">
                $
              </span>
              <span className="sr-only">{t.amountDollars}</span>
              <input
                ref={amountRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                dir="ltr"
                aria-label={t.amountDollars}
                placeholder={String(MIN_BID)}
                className="min-w-0 flex-1 bg-transparent text-center text-2xl font-bold tracking-[-0.03em] text-primary tabular-nums outline-none placeholder:text-muted-foreground/40"
                value={amount}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  touched.current = true;
                  setAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 6));
                }}
                onBlur={() => {
                  // Settle on leave: empty/0 → floor, oversized → MAX_BID.
                  if (touched.current) setAmount(String(clamp(parseInt(amount || "0", 10) || 0)));
                }}
                disabled={loading}
              />
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

        {/* ── Outcome preview: the rank this pay amount lands after payment
            (the card's sitting total + the delta). Mirrors the board's tie
            rule — equal bids stay behind the earlier payer — so the number
            shown is the number paid for. ── */}
        {value >= MIN_BID && (
          <p
            className="text-center text-xs font-semibold leading-relaxed text-pretty"
            aria-live="polite"
          >
            {projectedRank === 1 ? (
              <span className="text-primary">
                {bids.length === 0 ? t.firstOnBoard : `🥇 ${t.takesRank(1)}`}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {rankMedal && `${rankMedal} `}
                {t.takesRank(projectedRank)}
                {nextRankUp > 0 && (
                  <span className="text-primary">
                    {" · "}
                    {t.moreForRank(nextRankPrice - total, nextRankUp)}
                  </span>
                )}
              </span>
            )}
          </p>
        )}

        {error && (
          <p className="text-center text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        )}

        <p className="text-center text-xs leading-relaxed text-muted-foreground text-pretty">
          <span className="font-semibold text-primary/80">
            {t.startsFrom} ${MIN_BID}.
          </span>{" "}
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
