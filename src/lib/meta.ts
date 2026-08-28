"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// Meta (Facebook/Instagram) Pixel: loads once per browser session when
// NEXT_PUBLIC_META_PIXEL_ID is set. The shim below mirrors the official base
// code — events fired before connect.facebook.net loads are queued by the
// library, never dropped. Every helper is a no-op when the pixel id is absent
// so callers never branch (same contract as lib/tiktok.ts).

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";

// The pixel object starts as a plain queue array and gains methods at runtime,
// so the shim is intentionally loosely typed.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

/** Inject the official Meta pixel base code (idempotent). */
let loadPromise: Promise<void> | null = null;

export function getMeta(): Promise<void> {
  if (!PIXEL_ID || typeof window === "undefined") return Promise.resolve();
  if (!loadPromise) {
    loadPromise = new Promise<void>((resolve) => {
      const w = window;
      if (!w.fbq) {
        const fbq: any = function (...args: unknown[]) {
          if (fbq.callMethod) fbq.callMethod(...args);
          else fbq.queue.push(args);
        };
        w.fbq = fbq;
        w._fbq = fbq;
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = "2.0";
        fbq.queue = [];
        const script = document.createElement("script");
        script.async = true;
        script.src = "https://connect.facebook.net/en_US/fbevents.js";
        document.head.appendChild(script);
      }
      w.fbq("init", PIXEL_ID);
      resolve();
    });
  }
  return loadPromise;
}

/**
 * Fire a Meta standard/custom event (no-op when unconfigured). The optional
 * eventId goes in the third-arg `eventID` — it must match the Conversions
 * API event's event_id 1:1 so one payment counts exactly once.
 */
export async function metaTrack(
  event: string,
  data?: Record<string, unknown>,
  eventId?: string | null,
): Promise<void> {
  await getMeta();
  try {
    window.fbq?.("track", event, data, eventId ? { eventID: eventId } : undefined);
  } catch (e) {
    console.error("meta track failed", e);
  }
}

/**
 * Advanced matching: hash the signed-in user's email (normalized, SHA-256
 * hex — Meta's expected form) and attach it via a re-init so every event
 * from this browser attributes to a real person, not just a cookie.
 * Idempotent per session; no-op when unconfigured.
 */
export async function metaIdentifyEmail(email: string): Promise<void> {
  await getMeta();
  try {
    const normalized = email.trim().toLowerCase();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
    const hashed = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    window.fbq?.("init", PIXEL_ID, { em: hashed });
  } catch (e) {
    console.error("meta identify failed", e);
  }
}

/**
 * Mount once in the root layout. Fires PageView on every App Router
 * navigation (soft route changes don't trigger it automatically).
 */
export function MetaPixel() {
  const pathname = usePathname();
  const { user } = useAuth();
  useEffect(() => {
    void getMeta().then(() => {
      window.fbq?.("track", "PageView");
    });
  }, [pathname]);
  // Advanced matching: signed-in users attribute every event to a real
  // person (hashed email) — idempotent per email.
  useEffect(() => {
    if (user?.email) void metaIdentifyEmail(user.email);
  }, [user?.email]);
  return null;
}
