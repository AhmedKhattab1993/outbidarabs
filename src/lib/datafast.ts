// Server-side DataFast client: real analytics numbers for the stats pill.
// Uses the secret API token (DATAFAST_TOKEN) — never exposed to the browser.
// Results are cached in-memory for 60s (serverless instances share per-warm-instance).

const BASE = "https://datafa.st/api/v1";
const TOKEN = process.env.DATAFAST_TOKEN;
// NOTE: the API wants the internal website id (mongo-style), not the dfid_ tracking id
const WEBSITE_ID = process.env.DATAFAST_WEBSITE_ID;

export type DataFastStats = {
  online: number; // realtime visitors
  visitors: number; // all-time visitors
  pageviews: number; // all-time pageviews
};

type Cache = { at: number; data: DataFastStats };
const store = globalThis as unknown as { __datafastCache?: Cache };

async function fetchJson(path: string, timeoutMs = 4000): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        accept: "application/json",
        "user-agent": "outbidarabs/1.0",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.data?.[0] ?? body?.data ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Real analytics numbers, or null when not configured / unreachable. */
export async function getDataFastStats(): Promise<DataFastStats | null> {
  if (!TOKEN || !WEBSITE_ID) return null;

  const cached = store.__datafastCache;
  if (cached && Date.now() - cached.at < 60_000) return cached.data;

  const [realtime, overview] = await Promise.all([
    fetchJson(`/analytics/realtime?websiteId=${WEBSITE_ID}`),
    fetchJson(`/analytics/overview?websiteId=${WEBSITE_ID}&period=all`),
  ]);
  if (realtime == null && overview == null) return null;

  const data: DataFastStats = {
    online: realtime?.visitors ?? 0,
    visitors: overview?.visitors ?? 0,
    pageviews: overview?.pageviews ?? 0,
  };
  store.__datafastCache = { at: Date.now(), data };
  return data;
}
