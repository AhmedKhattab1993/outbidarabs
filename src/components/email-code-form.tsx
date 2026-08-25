"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang-context";

// Email-code login form (spec: 6-digit code, no password). Shared by the
// header modal, the success-page prompt and the profile page.
//
// mockPayerHint: mock-payment layers only (mock mode + Layer 2) — retags
// the browser's anonymous demo/mock payments to the typed email once the
// code send succeeds, mirroring how Dodo tells us the real payer email.

export const PAYER_HINT_KEY = "outbidarabs:payer";

export function getPayerHint(): string | null {
  try {
    return localStorage.getItem(PAYER_HINT_KEY);
  } catch {
    return null;
  }
}

export function ensurePayerHint(): string {
  try {
    let h = localStorage.getItem(PAYER_HINT_KEY);
    if (!h) {
      h = `payer-${crypto.randomUUID().slice(0, 8)}@mock.local`;
      localStorage.setItem(PAYER_HINT_KEY, h);
    }
    return h;
  } catch {
    return "payer@mock.local";
  }
}

const inputCls =
  "h-12 w-full rounded-2xl border border-input bg-transparent px-4 text-center text-base outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30";

export function EmailCodeForm({
  initialEmail,
  startAtCode = false,
  mockPayerHint = null,
  compact = false,
  onDone,
}: {
  initialEmail?: string;
  startAtCode?: boolean; // email already known (success-page prompt)
  mockPayerHint?: string | null;
  compact?: boolean;
  onDone: (email: string) => void;
}) {
  const { t } = useLang();
  const [step, setStep] = useState<"email" | "code" | "done">(startAtCode ? "code" : "email");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = (secs = 60) => {
    setCooldown(secs);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  // startAtCode means "this email came from the payment" — no code has been
  // sent yet, so one is fired automatically on mount (exactly once; the ref
  // survives React strict-mode's double effect). API cooldown/rate-limit
  // responses are respected, never fought.
  const autoSentRef = useRef(false);

  type SendOutcome =
    | { ok: true }
    | { ok: false; kind: "rate-limited" | "cooldown" | "invalid" | "network" };

  const sendCode = async (resend = false): Promise<SendOutcome> => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, mockPayerHint }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "rate-limited") {
          setError(t.tooManyCodes);
          return { ok: false, kind: "rate-limited" };
        }
        if (data.error === "cooldown") {
          // Gate the Resend button with the server's own window instead of
          // fighting it (code step); the email step just shows the message.
          if (step === "code") startCooldown(data.retryAfterSec ?? 60);
          else setError(t.cooldownSoon(data.retryAfterSec ?? 60));
          return { ok: false, kind: "cooldown" };
        }
        if (data.error === "send-failed") {
          // Provider failed to send (not rate limiting) — same recovery as a
          // network failure: retryable copy; the auto-send falls back to the
          // email step so "We sent a code” never renders unsent.
          setError(t.sendCodeFailed);
          return { ok: false, kind: "network" };
        }
        setError(t.invalidEmail);
        return { ok: false, kind: "invalid" };
      }
      setDevCode(data.devCode ?? null);
      startCooldown();
      if (!resend) {
        setStep("code");
        setCode("");
      }
      return { ok: true };
    } catch {
      setError(t.sendCodeFailed);
      return { ok: false, kind: "network" };
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!startAtCode || autoSentRef.current) return;
    autoSentRef.current = true;
    void (async () => {
      const r = await sendCode(true);
      if (r.ok || r.kind === "rate-limited" || r.kind === "cooldown") return;
      // The auto-send failed hard (bad email / network) — fall back to the
      // email step with the address pre-filled so the user can retry.
      setStep("email");
    })();
    // Fires once per mount (ref-guarded); sendCode is captured on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) {
        setError(t.invalidCode);
        setCode("");
        return;
      }
      setStep("done");
      onDone(email);
    } catch {
      setError(t.invalidCode);
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    return (
      <p className="text-center text-sm font-bold text-primary" role="status">
        {t.loginSuccess}
      </p>
    );
  }

  if (step === "code") {
    return (
      <form className="flex flex-col gap-3" onSubmit={verify}>
        <p className="text-center text-xs leading-relaxed text-muted-foreground text-pretty">
          {t.codeSentTo(email)}
        </p>
        {devCode && (
          <p className="rounded-xl bg-muted px-3 py-2 text-center text-xs font-bold text-foreground">
            {t.mockCodeNote(devCode)}
          </p>
        )}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          dir="ltr"
          required
          aria-label={t.codeLabel}
          placeholder="••••••"
          className={inputCls + " text-lg font-bold tracking-[0.4em] tabular-nums"}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          disabled={busy}
          autoFocus
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="inline-flex h-12 cursor-pointer items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? "…" : t.verify}
        </button>
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          {cooldown > 0 ? (
            <span className="tabular-nums">{t.resendIn(cooldown)}</span>
          ) : (
            <button
              type="button"
              onClick={() => sendCode(true)}
              disabled={busy}
              className="cursor-pointer font-semibold text-primary hover:underline disabled:opacity-50"
            >
              {t.resend}
            </button>
          )}
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="cursor-pointer hover:underline"
          >
            {t.back}
          </button>
        </div>
        {error && (
          <p className="text-center text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        sendCode();
      }}
    >
      {!compact && (
        <p className="text-center text-xs leading-relaxed text-muted-foreground text-pretty">
          {t.loginIntro}
        </p>
      )}
      <input
        type="email"
        dir="ltr"
        required
        autoComplete="email"
        aria-label={t.emailLabel}
        placeholder="you@example.com"
        className={inputCls}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
        autoFocus
      />
      <button
        type="submit"
        disabled={busy || !email.includes("@")}
        className="inline-flex h-12 cursor-pointer items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50"
      >
        {busy ? "…" : t.sendCode}
      </button>
      {error && (
        <p className="text-center text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
