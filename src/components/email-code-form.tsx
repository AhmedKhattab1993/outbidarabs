"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang-context";

// Email-code login form (spec: 6-digit code, no password). Shared by the
// header modal, the claim-form pay gate and the profile page.

const inputCls =
  "h-12 w-full rounded-2xl border border-input bg-transparent px-4 text-center text-base outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30";

export function EmailCodeForm({
  compact = false,
  onDone,
}: {
  compact?: boolean;
  onDone: (email: string) => void;
}) {
  const { t } = useLang();
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({ email }),
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
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Only a real rejection clears the typed code; anything else (5xx,
        // unexpected shape) is retryable and keeps the input.
        if (data && (data.error === "invalid-code" || data.error === "invalid-email")) {
          setError(t.invalidCode);
          setCode("");
        } else {
          setError(t.verifyFailed);
        }
        return;
      }
      setStep("done");
      onDone(email);
    } catch {
      // Network failure — the code may well be correct; keep it typed.
      setError(t.verifyFailed);
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
