// Server-side DataFast client: real analytics numbers for the stats pill.
// Uses the secret API token (DATAFAST_TOKEN) — never exposed to the browser.
// Results are cached in-memory for 60s (serverless instances share per-warm-instance).
//
// Two token types (https://datafa.st/docs/api):
//   df_…  website API key — the website is implied, websiteId must be omitted
//   dft_… account token   — requires ?websiteId= (DATAFAST_WEBSITE_ID, the mongo-style
//                           id — NOT the dfid_ tracking id used by the browser SDK)

const BASE = "https://datafa.st/api/v1";
const TOKEN = process.env.DATAFAST_TOKEN;
const WEBSITE_ID = process.env.DATAFAST_WEBSITE_ID;

const isWebsiteKey = !!TOKEN && TOKEN.startsWith("df_");

export type DataFastStats = {
  online: number | null; // realtime visitors (null = realtime fetch failed)
  visitors: number | null; // all-time visitors
  pageviews: number | null; // all-time pageviews
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
    if (!res.ok) {
      console.warn("datafast fetch failed", path, res.status);
      return null;
    }
    const body = await res.json();
    if (body?.status && body.status !== "success") {
      console.warn("datafast fetch error status", path, body.status);
      return null;
    }
    return body?.data?.[0] ?? body?.data ?? null;
  } catch {
    console.warn("datafast fetch error", path);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Real analytics numbers, or null when not configured / unreachable. */
export async function getDataFastStats(): Promise<DataFastStats | null> {
  if (!TOKEN) return null;
  if (!isWebsiteKey && !WEBSITE_ID) return null; // dft_ token needs websiteId

  const cached = store.__datafastCache;
  if (cached && Date.now() - cached.at < 60_000) return cached.data;

  // df_ keys: website implied (websiteId must be omitted); dft_: required.
  const qs = isWebsiteKey ? "" : `&websiteId=${encodeURIComponent(WEBSITE_ID!)}`;
  // No startAt/endAt = all-time (the API has no `period` param).
  const [realtime, overview] = await Promise.all([
    fetchJson(`/analytics/realtime?fields=visitors${qs}`),
    fetchJson(`/analytics/overview?fields=visitors,pageviews${qs}`),
  ]);
  if (realtime == null && overview == null) return null;

  const data: DataFastStats = {
    online: realtime != null ? Number(realtime.visitors ?? 0) : null,
    visitors: overview != null ? Number(overview.visitors ?? 0) : null,
    pageviews: overview != null ? Number(overview.pageviews ?? 0) : null,
  };
  store.__datafastCache = { at: Date.now(), data };
  return data;
}
