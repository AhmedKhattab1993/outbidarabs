# outbidarabs.lol

رتب حسابك على إنستجرام أو تيك توك — أعلى عرض = المركز الأول.

The Arab-world, platform-focused pay-to-rank leaderboard. Instagram and
TikTok profiles first; X, LinkedIn, websites and mobile apps supported too.
Anyone can list an account or product and pay to climb. Highest total bid =
highest rank. New listings start at $1; raising an existing listing costs only
the difference. Inspired by [outbid.lol](https://outbid.lol) — this edition is
built for the Arab market and focused on social media accounts.

## Stack

- **Next.js 15** (App Router) + TypeScript + Tailwind CSS v4
- **Supabase** — Postgres, Realtime leaderboard updates, RLS (public read, service-role write)
- **Polar.sh** — Merchant of Record checkout (works with Egyptian Visa/Mastercard)
- **Vercel** hosting
- Arabic (RTL, default) + English toggle, dark mode, DM Sans + IBM Plex Sans Arabic

## Quick start (no keys needed)

```bash
npm install
cp .env.example .env    # NEXT_PUBLIC_MOCK_MODE=true is the default
npm run dev
```

Mock mode runs the entire site self-contained: seeded leaderboard, mock checkout
(bids apply instantly through the real rules engine), click tracking. Perfect for
local development and demos.

## Development pipeline — test & verify before deploying to the domain

Five layers, each catching a different class of bug. Promote downward only when
the current layer passes; the smoke checklist gates every promotion, and
nothing reaches `outbidarabs.lol` without Layer 4 passing.

| Layer | Where | What it catches | Cost |
|---|---|---|---|
| 1. Local mock | `npm run dev` (default) | UI, RTL/AR/EN/dark, rules engine, identity edge cases, claim-form UX | seconds |
| 2. Local full-stack | Supabase CLI + `MOCK_MODE=false` | SQL bugs: schema, RLS, RPCs (`heartbeat`, `bump_stat`, `listing_rank`), Realtime | minutes |
| 3. Payments | Polar sandbox + tunnel/preview | Webhook signature, checkout amount (difference vs full), idempotency, success redirect | minutes |
| 4. Vercel preview | Branch deploy + staging Supabase | Build/env differences, cold starts, full path exactly as prod runs it | ~1 min/deploy |
| 5. Production | `outbidarabs.lol` | Live traffic & real money — monitored, smoke-verified after every deploy | deploy + verify |

### Layer 1 — Local mock (daily development)

```bash
npm run dev
```

No keys needed. Everything the rules engine does (windows, raises, ties,
idempotency) runs against the in-memory mock store. This is where ~90% of
development happens.

### Layer 2 — Local Supabase (before touching the real database)

Runs the real schema + RLS + RPCs locally so SQL mistakes surface before they
reach a shared database:

```bash
npx supabase init          # once (creates supabase/config.toml)
npx supabase start         # local Postgres + Realtime + Studio on :54322/:54323
npx supabase db reset      # replays supabase/migrations/* + seed.sql
```

The schema lives in `supabase/migrations/20250822000001_init.sql` (applied by
the CLI automatically); `supabase/schema.sql` is the same content for the
hosted SQL editor. `supabase/seed.sql` runs after migrations by CLI convention.

Then point `.env.local` at the local instance with `NEXT_PUBLIC_MOCK_MODE=false`
**and `ALLOW_MOCK_PAYMENTS=true`** (mock payments + real DB — lets the whole
rules engine write to Postgres without Polar) and restart `npm run dev`.

⚠️ Get the keys from `npx supabase status -o env` — the local API validates the
JWT issuer, and the keys printed by plain `supabase start` stdout may be
rejected silently (admin writes return null → confusing downstream errors).

Exercise: board loads, a bid lands (row in `listings` + `activity`),
`processed_checkouts` grows by one per apply, `site_stats.total_revenue` grows
by the paid delta, `/go/[id]` increments clicks, `/api/visit` heartbeat returns
online ≥ 1, Realtime pushes a new row without a manual refresh. All of this is
covered by `scripts/smoke.sh`.

### Layer 3 — Payments (Polar sandbox)

Why a separate layer from 2: different prerequisites (a Polar account +
webhook registration + public tunnel vs. just Docker), different bug classes
(integration vs. your SQL), and different cadence — you iterate on SQL often,
on payment code rarely. Isolating them also answers "my webhook or my
database?" instantly.

**Runs best composed with Layer 2** ("full local stack"): local Supabase +
Polar sandbox through the tunnel is the only local config that exercises the
real write path — `processed_checkouts` idempotency insert, service-role
writes, `add_stat` revenue RPC. Without Layer 2, Layer 3 applies listings to
the in-memory mock store and only tests webhook mechanics (still useful for
signature/cents/idempotency bugs).

Webhooks must reach a **public** URL — `localhost` won't work, and Vercel
deployment protection blocks them (they can't log in). Two options:

**a) Tunnel to local** (fastest iteration):

```bash
ngrok http 3000            # or: cloudflared tunnel --url http://localhost:3000
# Polar sandbox → webhook endpoint: https://<tunnel-id>.ngrok.io/api/webhooks/polar
```

**b) Preview deployment**: push a branch, open the Vercel preview URL, disable
deployment protection for it, point the sandbox webhook there.

Use Polar's test card on the sandbox checkout and verify: checkout `amount`
equals the **difference** for raises (×100 cents), the webhook applies the
listing once (fire the same event twice → one apply), and `/success` lands back
on the board with the new rank. With Layer 2 running, also confirm in the local
Supabase Studio that `processed_checkouts` has the checkout id, `activity` has
the row, and `site_stats.total_revenue` grew by the paid delta.

**Simulating Polar webhooks locally** — `scripts/simulate-webhook.mjs` signs a
`checkout.updated`/`succeeded` payload exactly like Polar and drives the full
path without a browser payment:

```bash
set -a; . ./.env; set +a
node scripts/simulate-webhook.mjs <amount> <identityUrl> <checkoutId-or-synthetic>
```

It sends four requests: valid (expect 200 + apply), replay (200, no double
apply), tampered payload (403), bad signature (403). If `<checkoutId>` is a
real sandbox `polar_c_…` id the payload is built from the actual checkout
object (exact Polar shape); otherwise a synthetic minimal object is used — the
SDK schema requires the full object, so prefer real ids (create one via
`POST /api/checkout`). Note: the SDK derives the HMAC key from the raw
`whsec_…` string bytes (not the base64 payload) — the simulator matches this.

### Layer 4 — Vercel preview / staging

**Staging is live at `staging.outbidarabs.lol`**: a hosted Supabase project
(`outbidarabs-staging`, real database, empty board) + Polar sandbox — the
full real product, money included (test cards), with data derived only from
actions taken on the site. The Polar sandbox webhook points at
`https://staging.outbidarabs.lol/api/webhooks/polar`.

⚠️ **Deploy with `bash scripts/deploy.sh [prod]`, never bare `vercel deploy`** —
the CLI uploads local `.env`/`.env.local` into the build, which would override
the project's Preview/Production env vars (local `NEXT_PUBLIC_MOCK_MODE=true`
and `localhost` Supabase URLs leak into the deployment). The script hides
local env files for the deploy and restores them after.

Env vars per target (Vercel → Settings → Environment Variables):
- **Preview**: staging Supabase keys + sandbox Polar + `SITE_URL=https://staging.outbidarabs.lol`
- **Production**: prod Supabase + prod Polar + `MOCK_MODE=false` (never set `ALLOW_MOCK_PAYMENTS`)

Note: Vercel's automatic DDoS mitigation can show a "Security Checkpoint" on
the domain after bursts of scripted traffic (smoke tests, webhooks). It's
infra-level, auto-expires within ~an hour, and is not an app issue.

### Layer 5 — Production (`outbidarabs.lol`)

The deployable layer — the only one money and real traffic touch.

**Promote procedure:**

```bash
bash scripts/smoke.sh https://<preview-url>   # layer 4 green
vercel deploy --prod                            # build + promote
bash scripts/smoke.sh https://outbidarabs.lol    # verify live
```

**Production checklist (beyond the smoke suite):**

- Env vars set for Production environment only: `NEXT_PUBLIC_MOCK_MODE=false`,
  prod Supabase URL/anon/service-role, `POLAR_ACCESS_TOKEN` + `POLAR_PRODUCT_ID`
  + `POLAR_WEBHOOK_SECRET` + `POLAR_ENVIRONMENT=production`,
  `NEXT_PUBLIC_SITE_URL=https://outbidarabs.lol`, optional
  `NEXT_PUBLIC_LAUNCH_DATE`
- Supabase prod project: `schema.sql` applied, Realtime enabled for `listings`
  + `activity` — **and no seed data**: production launches empty (fictional
  bids/clicks/revenue must never be presented as real activity)
- Polar production webhook `https://outbidarabs.lol/api/webhooks/polar`
  subscribed to checkout events; test once with a real small payment and refund it
- After first real webhook: confirm `total_revenue` grew and the activity feed
  has the row (this is what the earnings card displays)

**Production monitoring (manual for now — no alerts wired):**

- `/api/stats` — board size, top bid, revenue, online count
- Vercel dashboard → Deployments/Logs for runtime errors (webhook apply
  failures log `polar webhook apply failed <reason>`)
- Polar dashboard → payments vs. board: every captured checkout should appear
  as a listing/raise; any mismatch = investigate immediately (money involved)
- Supabase dashboard → Table editor for `listings`/`activity`/`processed_checkouts`

**Rollback:** `vercel ls` → find the last known-good production URL →
`vercel alias set <old-deployment-url> outbidarabs.lol` (near-instant; DB
schema rollbacks are separate — apply reverse SQL carefully).

**Current state:** production is live on the real stack (prod Supabase +
production Polar + DataFast) with an **empty board** — the honest launch state.
⚠️ **Never apply seed data to production**: the seed rows (and the
`total_revenue` sum of their bids) are fictional. Real listings/revenue may
only come from real payments. `scripts/seed-rest.mjs` is for **staging and
local demos only**.

### Pre-promote smoke checklist

One command, works against any layer:

```bash
bash scripts/smoke.sh http://localhost:3000    # layer 1–2
bash scripts/smoke.sh https://<preview>.vercel.app # layer 4
bash scripts/smoke.sh https://outbidarabs.lol     # layer 5, after every prod deploy
```

It checks (38 checks, exit 0 = pass):

1. Board renders: platform headline + filter pills + earnings card, listings
   carry `platform`
2. Platform filter: `?platform=instagram` returns only instagram listings
3. Preview API: URL → platform detection, bare `@handle` → ambiguous with
   candidates, platform hint resolves, post/short-link TikTok URLs rejected
4. Rules engine: bid at top+1 → accepted at rank #1 (highest bid wins);
   low bid accepted; raise accepted; raise ≤ current rejected
5. Identity: `about.me` allowed, `t.me` rejected, illegal-content hosts/path
   rejected (incl. Arabic paths), two Play Store `id`s → two listings
6. `/go/[id]` redirects with `?utm_source=outbidarabs`
7. `/rules`, `/about` return 200 + raise-by-difference + origin-note copy

**Serverless caveat:** mock mode keeps state in the lambda's memory, so on
Vercel each instance has its own board and stateful checks (raise/lookup) can
be inconclusive depending on instance affinity. The script detects this and
reports `⚠ inconclusive` instead of failing. Stateful checks are fully
reliable against local dev and any Supabase-backed deployment (layers 2–4).
Payment-only checks (checkout amount = difference, webhook idempotency) are
layer 3 and documented above — the script never calls Polar.

## Going live

### 1. Supabase

1. Create a project at [supabase.com](supabase.com)
2. Run `supabase/schema.sql` in the SQL editor (tables, indexes, RLS, functions)
3. **Staging/local only:** run `supabase/seed.sql` for a populated demo board —
   in the SQL editor, or without a psql connection string:
   `node scripts/seed-rest.mjs <supabase-url> <service-role-key>` (same data,
   through PostgREST). Never on production — the seed rows are fictional and
   would fake bids, clicks and revenue on a live money site
4. Copy **Settings → API**: project URL + anon key into `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_ANON_KEY`, and the service-role key into
   `SUPABASE_SERVICE_ROLE_KEY` (server writes: webhook + click redirect + presence)
5. Enable Realtime for the `listings` and `activity` tables (Database → Replication)

### 2. Payments (Dodo Payments — primary)

Polar classifies paid leaderboards as "directories and boards" (restricted, likely
not accepted) — keep the appeal open, but Dodo is the primary provider now:

1. Create an account at [dodopayments.com](https://dodopayments.com) (merchant
   acceptance includes Egypt, Saudi, UAE)
2. Create a product with **Pay What You Want** enabled and a **$1 minimum**
   (per-checkout `amount` = the bid, or the raise difference — only honored on
   PWYW products). One-time payment, single product
3. Copy the API key into `DODO_API_KEY` and the product id into `DODO_PRODUCT_ID`
4. Developer → Webhooks → add endpoint `https://yourdomain.com/api/webhooks/dodo`
   subscribed to **payment.succeeded**; copy the signing secret (`whsec_…`)
   into `DODO_WEBHOOK_SECRET`
5. `DODO_ENVIRONMENT=test_mode` until live, then `live_mode` + real keys

Simulating Dodo webhooks locally (signs payloads per the Standard Webhooks
spec, exactly like Dodo):

```bash
set -a; . ./.env; set +a
node scripts/simulate-dodo-webhook.mjs <amount> <identityUrl> [paymentId] [charge]
```

Valid (applies) · replay (no double apply) · tampered body (403) · bad
signature (403).

Provider selection: `PAYMENT_PROVIDER=dodo|polar` forces one; otherwise the
first provider with a complete key set wins (dodo first). Both webhooks can
stay registered — the apply layer is idempotent per payment id.

### 2b. Polar (secondary — appeal pending)

1. Create an account at [polar.sh](polar.sh) (sandbox first)
2. Create a product **"Outbid Spot"** with a **custom price** — set the product
   minimum to **$1** (raises are charged only the difference, which can be $1)
3. Copy the product ID into `POLAR_PRODUCT_ID`, a token into `POLAR_ACCESS_TOKEN`
4. Add a webhook endpoint `https://yourdomain.com/api/webhooks/polar`
   subscribed to **checkout** events, copy the secret into `POLAR_WEBHOOK_SECRET`

   ⚠️ **Webhook secrets are per-endpoint per-environment.** The sandbox org's
   endpoint (→ `staging.`) and the production org's endpoint (→ apex domain)
   each have their own `whsec_…`. Vercel **Preview/Development** keep the
   sandbox secret; **Production** must hold the production endpoint's secret —
   a sandbox secret there means every real payment's webhook 403s and the
   listing never applies. Swap it with:

   ```bash
   bash scripts/set-prod-webhook-secret.sh whsec_…   # updates env + redeploys
   ```

   Also remember a webhook endpoint must exist **in the production org**
   (no endpoint = no deliveries at all, silently).

5. Set `POLAR_ENVIRONMENT=production` when live and `NEXT_PUBLIC_MOCK_MODE=false`
   — swap `POLAR_ACCESS_TOKEN` + `POLAR_PRODUCT_ID` + `POLAR_WEBHOOK_SECRET`
   **together** and redeploy; a mix of sandbox and production values fails
   either at checkout creation or at webhook validation.

Flow: claim form (single input, auto platform detection, smart-fetch preview
with manual editing) → `POST /api/checkout` (validates identity, strips
tracking params, accepts the edited title/description/image) → provider-hosted
checkout (Dodo or Polar) charging **the difference** for raises (full bid for
new listings) → `payment.succeeded` webhook (idempotent per payment id,
race-safe) → listing created/raised → Realtime pushes the new board to every
visitor.

### 3. Vercel

```bash
npx vercel
```

Add all env vars from `.env.example` in the project settings and point
`NEXT_PUBLIC_SITE_URL` at the final domain. Optionally set
`NEXT_PUBLIC_LAUNCH_DATE` (ISO) — it feeds the earnings card and About page.

## Rules engine (highest bid wins — per the product spec)

- Whole dollars, **$1 minimum**, **$999,999 maximum** — new listings start at $1
- **Ranking is determined only by total bid amount**: any bid above the current
  top takes #1 (no artificial window)
- Equal bids: the older bid keeps the higher rank (`ORDER BY bid_amount DESC, last_bid_at ASC`)
- Re-submitting the same account/URL **raises** the bid — you pay **only the
  difference** (+$1 minimum); the payment is applied race-safely
- The board is **organized by platform** (Instagram | TikTok | X | LinkedIn |
  Website | App) with filter pills; ranks are always the global rank
- Platform canonicalization: instagram.com/`user`, tiktok.com/@`user`,
  x.com/`user`, linkedin.com/in/`slug`, App Store/Play Store URLs keyed by path
  (Play Store `id` param included), anything else = website
- Bare `@handle` inputs are ambiguous → the form shows platform selector chips
  (Instagram / TikTok / X, filtered by each platform's username rules)
- Tracking/affiliate params stripped from listings **and** click-throughs
- Forbidden: chat & invite links (Telegram/WhatsApp/Discord/…), NSFW, shorteners,
  and illegal content — drugs, gambling/betting (including major operators via a
  brand-host denylist), weapons, counterfeit, fraud, stolen accounts — regardless
  of licensing; manual takedown via `listings.is_active = false` is the backstop
- Webhook applies are idempotent (`processed_checkouts`); every successful
  payment appends to `activity` and adds its paid delta to `total_revenue`
  (the earnings-card number)
- Polar checkouts carry `datafast_visitor_id`/`datafast_session_id` metadata for
  DataFast revenue attribution (https://datafa.st/docs/polar-checkout-api)

## Smart fetching (preview card)

When an input is detected, `/api/preview` fetches public data for the card
(best effort — never blocks, 4.5s timeout, 10-minute server cache, and the user
can always edit title/description/image manually):

| Platform | Source | Gets |
|---|---|---|
| Website | page OG tags | image, title, description (+ favicon fallback in UI) |
| App (App Store) | iTunes Lookup API | icon, name, developer, description |
| App (Play Store) | page OG tags | icon, name, description |
| TikTok | tiktok.com oEmbed | nickname, avatar |
| X | publish.twitter.com oEmbed | display name |
| Instagram | web_profile_info + OG fallback (usually walled → clean fallback) | best effort |
| LinkedIn | page OG tags (usually login-walled) | best effort |

Failed/generic fetches return `meta: null` → the card falls back to the platform
icon + handle with everything editable, exactly as the spec requires.

## Parity with the reference

- 50 rows per page + "1–50 of N" count + ↻ Refresh
- Platform filter pills (All | Instagram | TikTok | X | LinkedIn | Website | App)
  + platform badge on every listing avatar
- Earnings card ("The Arab outbid board has made $X since its launch…")
- Real images: smart-fetch avatar/icon captured at submission (editable in the
  preview card) → favicon → letter fallback
- Clicks redirect through `/go/[id]` with `utm_source=outbidarabs` appended
- Live "online" counter via presence heartbeats (75s window)
- Public analytics dashboard: `see stats →` pill + footer `Live stats` link to
  `NEXT_PUBLIC_ANALYTICS_URL` (reference uses Vemetric public dashboards);
  provider script injected via `NEXT_PUBLIC_ANALYTICS_SCRIPT_URL` +
  `NEXT_PUBLIC_ANALYTICS_SITE_ID` (DataFast, Vemetric, Plausible — any)
- Claim-form UX: detection → platform chips for ambiguous handles → preview
  card with editable title/description/image + cleaned destination URL;
  typing an existing account shows "Already on the board at $X. Checkout only
  charges the $N difference.", the button relabels to "Pay $N more"
- Claim price pill on every row: bid + $1 (any bid above the holder takes it)

## Feature flags

- `NEXT_PUBLIC_SHOW_TRENDING_ACTIVITY=true` — re-enables the Trending / Latest
  activity side cards (hidden at launch; implementation + click tracking stay
  live so the cards return with history). Verify with
  `EXPECT_SIDE_CARDS=1 bash scripts/smoke.sh <url>`.
- `/api/stats` exposes `statsSource` (`datafast` | `internal`) — which analytics
  provider the online/visitors numbers come from.

## Project layout

```
src/
  app/
    page.tsx                 # leaderboard homepage
    rules/ about/ success/   # static pages (server metadata + client inner)
    api/
      checkout/              # validation + Polar checkout (charges difference)
      preview/               # platform detection + smart fetch + re-bid context
      webhooks/polar/        # payment → listing (idempotent, race-safe)
      board/ stats/ visit/   # live data (platform filters) + presence heartbeat
      lookup/                # existing-listing detection for the claim form
    go/[id]/                 # click tracking redirect (utm_source=outbidarabs)
  components/                # outbid.lol-style UI components
  lib/
    store.ts                 # Supabase + mock data layer + rules engine
    identity.ts              # platform detection & canonicalization, moderation
    fetch-meta.ts            # smart fetching (OG / oEmbed / store APIs) + cache
    platforms.ts             # platform model, labels, detection helpers
    i18n.ts                  # AR/EN dictionary + bid constants
supabase/
  schema.sql seed.sql
```
