"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// TikTok Pixel: loads once per browser session when NEXT_PUBLIC_TIKTOK_PIXEL_ID
// is set. The shim below mirrors the official base code — events fired before
// analytics.tiktok.com loads are queued by the library, never dropped. Every
// helper is a no-op when the pixel id is absent so callers never branch.

const PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || "";

// The pixel object starts as a plain queue array and gains methods at runtime,
// so the base-code shim is intentionally loosely typed.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    ttq?: any;
    TiktokAnalyticsObject?: string;
  }
}

const TTQ_METHODS = [
  "page",
  "track",
  "identify",
  "instances",
  "debug",
  "on",
  "off",
  "once",
  "ready",
  "alias",
  "group",
  "enableCookie",
  "disableCookie",
  "holdConsent",
  "revokeConsent",
  "grantConsent",
] as const;

/** Inject the official TikTok pixel base code (idempotent). */
let loadPromise: Promise<void> | null = null;

export function getTikTok(): Promise<void> {
  if (!PIXEL_ID || typeof window === "undefined") return Promise.resolve();
  if (!loadPromise) {
    loadPromise = new Promise<void>((resolve) => {
      const w = window;
      w.TiktokAnalyticsObject = "ttq";
      const ttq: any = (w.ttq ??= []);
      if (!ttq._loaded) {
        ttq.methods = TTQ_METHODS;
        ttq.setAndDefer = (obj: any, method: string) => {
          obj[method] = (...args: unknown[]) =>
            obj.push([method, ...args]);
        };
        for (const m of TTQ_METHODS) ttq.setAndDefer(ttq, m);
        ttq.load = (id: string) => {
          const url = "https://analytics.tiktok.com/i18n/pixel/events.js";
          ttq._i = ttq._i || {};
          ttq._i[id] = [];
          ttq._i[id]._u = url;
          ttq._t = ttq._t || {};
          ttq._t[id] = +new Date();
          ttq._o = ttq._o || {};
          ttq._o[id] = {};
          const script = document.createElement("script");
          script.type = "text/javascript";
          script.async = true;
          script.src = `${url}?sdkid=${id}&lib=ttq`;
          document.head.appendChild(script);
        };
        ttq.load(PIXEL_ID);
        ttq.page();
        ttq._loaded = true;
      }
      resolve();
    });
  }
  return loadPromise;
}

/** Fire a TikTok standard/custom event (no-op when unconfigured). */
export async function tiktokTrack(
  event: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await getTikTok();
  try {
    window.ttq?.track?.(event, data);
  } catch (e) {
    console.error("tiktok track failed", e);
  }
}

/**
 * Advanced matching: hash the signed-in user's email (normalized, SHA-256
 * hex — TikTok's expected form) and attach it to the pixel so every event
 * from this browser attributes to a real person, not just a cookie.
 * Idempotent per session; no-op when unconfigured.
 */
export async function tiktokIdentifyEmail(email: string): Promise<void> {
  await getTikTok();
  try {
    const normalized = email.trim().toLowerCase();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
    const hashed = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    window.ttq?.identify?.({ email: hashed });
  } catch (e) {
    console.error("tiktok identify failed", e);
  }
}

/**
 * Mount once in the root layout. Loads the pixel and fires Pageview on every
 * App Router navigation (soft route changes don't trigger it automatically).
 */
export function TikTokPixel() {
  const pathname = usePathname();
  const { user } = useAuth();
  useEffect(() => {
    void getTikTok().then(() => {
      window.ttq?.page?.();
    });
  }, [pathname]);
  // Advanced matching: signed-in users attribute every event to a real
  // person (hashed email), not just a cookie — idempotent per email.
  useEffect(() => {
    if (user?.email) void tiktokIdentifyEmail(user.email);
  }, [user?.email]);
  return null;
}
