"use client";

import { useEffect, useState } from "react";
import { initDataFast, type DataFastWeb } from "datafast";

// DataFast analytics: initialized once per browser session when a website id
// is configured. Public dashboard link (see stats →) comes from
// NEXT_PUBLIC_ANALYTICS_URL.
export const ANALYTICS_URL = process.env.NEXT_PUBLIC_ANALYTICS_URL || "";
const WEBSITE_ID = process.env.NEXT_PUBLIC_DATAFAST_WEBSITE_ID || "";

let client: DataFastWeb | null = null;
let initPromise: Promise<DataFastWeb | null> | null = null;

export function getAnalytics(): Promise<DataFastWeb | null> {
  if (!WEBSITE_ID) return Promise.resolve(null);
  if (client) return Promise.resolve(client);
  if (!initPromise) {
    initPromise = initDataFast({
      websiteId: WEBSITE_ID,
      autoCapturePageviews: true, // initial view + client-side route changes
    })
      .then((df) => {
        client = df;
        return df;
      })
      .catch((e) => {
        console.error("datafast init failed", e);
        return null;
      });
  }
  return initPromise;
}

/** Mount once in the root layout to start analytics. Renders nothing. */
export function Analytics() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    getAnalytics().then((df) => {
      if (df) setReady(true);
    });
  }, []);
  return null;
}

/** Track a custom event (no-op when analytics is not configured). */
export async function trackEvent(name: string, props?: Record<string, string | number | boolean>) {
  const df = await getAnalytics();
  if (df) df.track(name, props);
}

/** Track a completed payment (email-based revenue attribution). */
export async function trackPayment(email: string | null, amount: number, currency = "USD") {
  const df = await getAnalytics();
  if (df) {
    if (email) df.trackPayment({ email, amount, currency });
    else df.track("payment", { amount, currency });
  }
}
