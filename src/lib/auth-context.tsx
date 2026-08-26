"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLang } from "@/lib/lang-context";
import { EmailCodeForm } from "@/components/email-code-form";

// Client auth state + the global login modal. Login is only ever *prompted*
// (profile / post-payment attribution) — never required to browse or pay.

export type AuthUser = {
  id: string;
  publicId: string | null; // opaque /u/ id (auth uuids never appear publicly)
  email: string;
  profile: {
    display_name: string;
    avatar_url: string | null;
    is_public: boolean;
    created_at: string;
  } | null;
};

type LoginIntent = { onDone?: (user: AuthUser) => void };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<AuthUser | null>;
  openLogin: (intent?: LoginIntent) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<LoginIntent | null>(null);

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user ?? null);
        return data.user ?? null;
      }
      setUser(null);
      return null;
    } catch {
      /* offline — keep current state */
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openLogin = useCallback((intent?: LoginIntent) => {
    setModal(intent ?? {});
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, openLogin, signOut }),
    [user, loading, refresh, openLogin, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {modal && <LoginModal onClose={() => setModal(null)} onLoggedIn={refresh} intent={modal} />}
    </AuthContext.Provider>
  );
}

function LoginModal({
  onClose,
  onLoggedIn,
  intent,
}: {
  onClose: () => void;
  onLoggedIn: () => Promise<AuthUser | null>;
  intent: LoginIntent;
}) {
  const { t } = useLang();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t.loginTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-3xl border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold tracking-[-0.02em]">{t.loginTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
              <path
                d="M18 6 6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <EmailCodeForm
          onDone={async () => {
            const u = await onLoggedIn();
            if (u) intent.onDone?.(u);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
