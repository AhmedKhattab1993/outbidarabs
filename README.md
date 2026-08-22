# outbidarabs.lol

أول منصة عربية للـ Outbid — ادفع أقل من المنافس وارفع للترتيب الأول.

An Arab-world clone of [outbid.lol](https://outbid.lol): a live, public pay-to-rank
leaderboard. Anyone can list a website, X handle, app or product and pay to climb.
Higher bid = higher rank. No ads, no accounts, no revenue share. Pure competition + FOMO.

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
- Supabase prod project: `schema.sql` applied, `seed.sql` only if you want a
  populated launch board, Realtime enabled for `listings` + `activity`
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

**Current state:** production is live but in **mock mode** (no Supabase, no
Polar) — treat it as staging until the Layer 3/4 prerequisites are done.

### Pre-promote smoke checklist

One command, works against any layer:

```bash
bash scripts/smoke.sh http://localhost:3000    # layer 1–2
bash scripts/smoke.sh https://<preview>.vercel.app # layer 4
bash scripts/smoke.sh https://outbidarabs.lol     # layer 5, after every prod deploy
```

It checks (18 checks, exit 0 = pass):

1. Board renders: claim form + earnings card, 50/page listings, count line
2. #1 window: bid at top+1 → rejected with the exact "To take #1, bid at least $X" message
3. Current #1 self-raise allowed; existing raise ≤ current rejected
4. Identity: `about.me` allowed, `t.me` rejected, two Play Store `id`s → two listings
5. `/go/[id]` redirects with `?utm_source=outbidarabs`
6. `/rules`, `/about` return 200

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
3. Optionally run `supabase/seed.sql` for a populated board
4. Copy **Settings → API**: project URL + anon key into `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_ANON_KEY`, and the service-role key into
   `SUPABASE_SERVICE_ROLE_KEY` (server writes: webhook + click redirect + presence)
5. Enable Realtime for the `listings` and `activity` tables (Database → Replication)

### 2. Polar

1. Create an account at [polar.sh](polar.sh) (sandbox first)
2. Create a product **"Outbid Spot"** with a **custom price** — set the product
   minimum to **$1** (raises are charged only the difference, which can be $1)
3. Copy the product ID into `POLAR_PRODUCT_ID`, a token into `POLAR_ACCESS_TOKEN`
4. Add a webhook endpoint `https://yourdomain.com/api/webhooks/polar`
   subscribed to **checkout** events, copy the secret into `POLAR_WEBHOOK_SECRET`
5. Set `POLAR_ENVIRONMENT=production` when live and `NEXT_PUBLIC_MOCK_MODE=false`

Flow: claim form → `POST /api/checkout` (validates identity, strips tracking
params, enforces the #1 window, fetches og:description/og:image) → Polar-hosted
checkout charging **the difference** for raises (full bid for new listings) →
webhook `checkout.updated` (`confirmed`/`succeeded`, idempotent per checkout id) →
listing created/raised → Realtime pushes the new board to every visitor.

### 3. Vercel

```bash
npx vercel
```

Add all env vars from `.env.example` in the project settings and point
`NEXT_PUBLIC_SITE_URL` at the final domain. Optionally set
`NEXT_PUBLIC_LAUNCH_DATE` (ISO) — it feeds the earnings card and About page.

## Rules engine (mirrors outbid.lol exactly)

- Whole dollars, **$5 minimum**, **$999,999 maximum**
- **Taking #1 costs current top bid + $5** — bids inside the (top, top+5)
  window are rejected: "To take #1, bid at least $X." The current #1 may
  extend its own lead by any amount ≥ $1
- Lower bids land at the rank they can reach; equal bids: the older bid keeps
  the higher rank (`ORDER BY bid_amount DESC, last_bid_at ASC`)
- Re-submitting the same URL/handle **raises** the bid — you pay **only the
  difference** (+$1 minimum); the payment is applied race-safely (if the board
  moved mid-checkout, your paid difference still buys exactly that raise)
- Platform links (App Store / Play Store / GitHub) keyed by path; the Play
  Store `id` param is part of the key so different apps don't share a bid
- Tracking/affiliate params stripped from listings **and** click-throughs
- Forbidden: chat & invite links (Telegram/WhatsApp/Discord/…), NSFW, shorteners
- Webhook applies are idempotent (`processed_checkouts`); every successful
  payment appends to `activity` and adds its paid delta to `total_revenue`
  (the earnings-card number)

## Parity with the reference

- 50 rows per page + "1–50 of N" count + ↻ Refresh
- Earnings card ("This simple side project made $X since its launch…")
- Real logos: og:image captured at submission → favicon → letter fallback
- Clicks redirect through `/go/[id]` with `utm_source=outbidarabs` appended
- Live "online" counter via presence heartbeats (75s window)
- Public analytics dashboard: `see stats →` pill + footer `Live stats` link to
  `NEXT_PUBLIC_ANALYTICS_URL` (reference uses Vemetric public dashboards);
  provider script injected via `NEXT_PUBLIC_ANALYTICS_SCRIPT_URL` +
  `NEXT_PUBLIC_ANALYTICS_SITE_ID` (DataFast, Vemetric, Plausible — any)
- Claim-form UX: typing an existing URL shows "Already on the board at $X.
  Checkout only charges the $N difference.", the button relabels to
  "Pay $N more" and the headline becomes "Raise to #1 for"
- #1 hover pill: top + $5; all other ranks: bid + $1

## Project layout

```
src/
  app/
    page.tsx                 # leaderboard homepage
    rules/ about/ success/   # static pages (server metadata + client inner)
    api/
      checkout/              # validation + #1 window + Polar checkout (charges difference)
      webhooks/polar/        # payment → listing (idempotent, race-safe)
      board/ stats/ visit/   # live data + presence heartbeat
      lookup/                # existing-listing detection for the claim form
    go/[id]/                 # click tracking redirect (utm_source=outbidarabs)
  components/                # outbid.lol-style UI components
  lib/
    store.ts                 # Supabase + mock data layer + rules engine
    identity.ts              # URL/@handle normalization & moderation
    i18n.ts                  # AR/EN dictionary + bid constants
supabase/
  schema.sql seed.sql
```
