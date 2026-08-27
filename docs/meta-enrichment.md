# Instagram metadata enrichment (Pattern B)

## The problem it solves

Instagram login-walls **every datacenter IP**: the `web_profile_info`
endpoint answers `401 "Please wait a few minutes"`, profile pages redirect
to `/accounts/login`. Verified repeatedly from Vercel egress *and* typical
home connections — there is no first-party server-side path. The old code
routed around this with a fallback stack (per-IP pacing, lockout cooldowns,
Wayback Machine archives, background heals, client late-retries) that was
slow, stale, and still failed — which is why users saw *"Couldn't fetch
account data right now"*.

## The architecture (one source, DB is truth, no fallbacks)

```
paste → GET /api/preview
         meta_cache row fresh ('ok') → row (~50ms)        ← only path after first fetch
         row stale ('ok')         → row now + background refresh
         row missing/expired/failed-backoff → claim lease → {fetchStatus:"pending"}
                                              └─ after(): enrichment job

job:  proxied web_profile_info (IG_PROXY_URL — the unblocking proxy)
      → avatar downloaded, sniffed, uploaded to `listing-meta` bucket
        (IG CDN URLs are signed and expire; storage URLs are permanent)
      → finish_meta_fetch('ok') — one row write

failure → finish_meta_fetch('failed') + backoff (5s, 20s, then 1h cooldown);
          client polls with backoff (~30s window), then shows the terminal
          "couldn't fetch" note with the custom-name input.
```

State machine on `meta_cache` (see
`supabase/migrations/20250827000002_meta_fetch_jobs.sql`):

| column | meaning |
|---|---|
| `fetch_status` | `pending` (lease live) / `ok` (has data) / `failed` (backoff) |
| `attempts` | consecutive claims since the last success (cap 3/session) |
| `next_attempt_at` | lease end while pending; backoff/cooldown end while failed |

`claim_meta_fetch()` is atomic (`for update`) — concurrent requests, lambdas
and the cron never double-fetch; whoever flips the row to `pending` runs the
job (in `after()`, 75s lease). `finish_meta_fetch()` is the terminal write.

Non-Instagram platforms are unchanged: fast synchronous fetches that work
from datacenter IPs (tiktok, x, website, app, linkedin).

## IG_PROXY_URL — the one required credential

Root-cause fix: the proxied fetch **is** the only IG path. Without it,
enrichment fails honestly (`pending → failed`) and cards show the handle.
Formats:

```
# query-param unblocker (ScraperAPI, ScrapingBee, …):
IG_PROXY_URL=https://api.scraperapi.com/?api_key=KEY&url={url}

# plain proxy with creds (Bright Data superproxy, Oxylabs, …):
IG_PROXY_URL=http://user:pass@brd.superproxy.io:22235

# built-in deterministic fixture — staging/dev wiring check only:
IG_PROXY_URL=dev-fixture://
```

Any unblocker that returns the **raw body** of
`https://www.instagram.com/api/v1/users/web_profile_info/?username=…`
works. Dedicated "Instagram API" dataset products (different JSON shape)
are not supported.

### Choosing a provider

Managed/unblocking endpoints (Bright Data Web Unlocker, ScraperAPI IG
support, Oxylabs Web Unblocker) historically run ~95–99% success with
1–3s cached / 5–15s fresh-unlock latency; they own the cat-and-mouse.
Bare residential proxies without unblocking are NOT enough — IG
fingerprints more than IP. Verify your candidate on your own traffic with
`scripts/test-ig-proxy.mjs` (local fixture) + a staging smoke before
committing.

## Verification

```bash
# proxy fetch path (template mode over real HTTP, not-found shape, fixture):
node --experimental-strip-types --import ./scripts/register-paths.mjs \
  scripts/test-ig-proxy.mjs

# validate a REAL provider key locally before deploying (30s):
node --experimental-strip-types --import ./scripts/register-paths.mjs \
  scripts/test-ig-proxy.mjs --live "http://brd-customer-…-zone-ZONE:PASS@brd.superproxy.io:22235"

# staging end-to-end (set IG_PROXY_URL on preview scope, then):
curl "https://staging.outbidarabs.lol/api/preview?identity=https://instagram.com/nasa"
# → {"meta":null,"fetchStatus":"pending",…}; poll again a few seconds later
# → {"meta":{"title":"NASA",…},…}
```

### Bright Data quickstart (recommended)

1. brightdata.com → Start free (Web Unlocker product) — free tier 5K
   requests/month, no card; PAYG beyond that at ~$1.5/1K, success-only.
2. Dashboard → create a **Web Unlocker** zone → copy its credentials
   (`brd-customer-…-zone-…` + password).
3. Validate locally (command above, `--live` + `http://USER:PASS@brd.superproxy.io:22235`).
4. Check the dashboard for an `instagram.com` domain multiplier — if one
   applies, budget accordingly (the free 5K shrinks by it).
5. `vercel env add IG_PROXY_URL preview` with the same URL →
   `bash scripts/deploy.sh` → paste a fresh IG handle on staging.

## Ops notes

- `IG_PROXY_URL` unset on production → IG previews show the fallback note
  (same as before this change, minus multi-second stalls). Set it to go live.
- `dev-fixture://` writes synthetic rows (`title` contains "fixture") —
  fine for staging demos, never point it at production (staging shares the
  production database today).
- The daily `/api/cron/heal-meta` re-claims failed IG rows with `force` and
  uses the same job; avatars land in Storage so board images stop rotting.
- `docs/` runbook for the old Wayback pipeline is superseded by this file.
