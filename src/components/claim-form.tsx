"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang-context";
import { MIN_BID, MAX_BID } from "@/lib/i18n";
import { identityErrorMessages } from "@/lib/identity";

const stepperBtn =
  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-primary/15 text-sm font-bold text-primary transition-all outline-none select-none hover:bg-primary/25 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export function ClaimForm({ topBid }: { topBid: number }) {
  const { t, lang } = useLang();
  const [amount, setAmount] = useState(String(Math.max(MIN_BID, topBid + 5)));
  const [identity, setIdentity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the suggested #1 price in sync when the board changes and the user
  // hasn't touched the stepper yet.
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current) setAmount(String(Math.max(MIN_BID, topBid + 5)));
  }, [topBid]);

  // "claim this rank for $X" buttons elsewhere on the page
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

  const changeAmount = (next: number, byUser: boolean) => {
    if (byUser) touched.current = true;
    setAmount(String(clamp(next)));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = parseInt(amount, 10);
    if (!Number.isFinite(value) || value < MIN_BID) {
      setError(identityErrorMessages("too-low", lang));
      return;
    }
    if (value > MAX_BID) {
      setError(identityErrorMessages("over-max", lang));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identity, amount: value }),
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

  return (
    <section id="claim" className="scroll-mt-6">
      <h2 className="flex flex-wrap items-center justify-center gap-x-2 text-center text-[28px] font-bold tracking-[-0.03em] text-pretty md:text-[40px]">
        <span>{t.claim1For}</span>
        <span className="inline-flex items-center gap-2">
          <button
            type="button"
            aria-label={t.decreaseBid}
            className={stepperBtn}
            onClick={() => changeAmount(parseInt(amount || "0", 10) - 1, true)}
            disabled={loading}
          >
            −
          </button>
          <label className="relative inline-block text-primary underline decoration-2 decoration-dashed underline-offset-[6px]">
            <span className="sr-only">{t.amountDollars}</span>
            <span className="invisible whitespace-nowrap tabular-nums" aria-hidden="true">
              ${amount}
            </span>
            <span className="absolute inset-0 flex items-baseline">
              <span aria-hidden="true">$</span>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full min-w-0 bg-transparent p-0 font-[inherit] text-[inherit] tracking-[inherit] tabular-nums outline-none"
                value={amount}
                onChange={(e) => {
                  touched.current = true;
                  const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                  setAmount(digits);
                }}
                disabled={loading}
              />
            </span>
          </label>
          <button
            type="button"
            aria-label={t.increaseBid}
            className={stepperBtn}
            onClick={() => changeAmount(parseInt(amount || "0", 10) + 1, true)}
            disabled={loading}
          >
            +
          </button>
        </span>
      </h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm font-medium leading-relaxed text-muted-foreground text-pretty">
        <span className="text-primary/70">
          {t.newSpotsStart} ${MIN_BID}.
        </span>{" "}
        {t.payingLess}
      </p>
      <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute top-1/2 start-2.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3.5">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <ellipse cx="12" cy="12" rx="4" ry="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M2 12H22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              </svg>
            </span>
            <input
              id="identity"
              placeholder={t.placeholder}
              autoComplete="off"
              spellCheck={false}
              required
              className="h-11 w-full min-w-0 rounded-xl border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 ps-10"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !identity.trim()}
            className="inline-flex h-11 w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-transparent bg-primary px-5 text-sm font-bold whitespace-nowrap text-primary-foreground transition-all outline-none select-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
          >
            {loading ? "…" : t.outbid}
          </button>
        </div>
        {error && (
          <p className="text-center text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        )}
        <p className="text-center text-xs leading-relaxed text-muted-foreground text-pretty">
          {t.alreadyOnList}
        </p>
      </form>
    </section>
  );
}
