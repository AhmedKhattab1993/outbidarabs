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
- **Dodo Payments** — Merchant of Record checkout (accepts EG/SA/AE merchants)
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
| 3. Payments | Dodo test_mode + tunnel/preview | Webhook signature, checkout amount (difference vs full), idempotency, success redirect | minutes |
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
rules engine write to Postgres without Dodo) and restart `npm run dev`.

⚠️ Get the keys from `npx supabase status -o env` — the local API validates the
JWT issuer, and the keys printed by plain `supabase start` stdout may be
rejected silently (admin writes return null → confusing downstream errors).

Exercise: board loads, a bid lands (row in `listings` + `activity`),
`processed_checkouts` grows by one per apply, `site_stats.total_revenue` grows
by the paid delta, `/go/[id]` increments clicks, `/api/visit` heartbeat returns
online ≥ 1, Realtime pushes a new row without a manual refresh. All of this is
covered by `scripts/smoke.sh`.

### Layer 3 — Payments (Dodo test mode)

Why a separate layer from 2: different prerequisites (a Dodo account +
webhook registration + public tunnel vs. just Docker), different bug classes
(integration vs. your SQL), and different cadence — you iterate on SQL often,
on payment code rarely. Isolating them also answers "my webhook or my
database?" instantly.

**Runs best composed with Layer 2** ("full local stack"): local Supabase +
Dodo test mode through the tunnel is the only local config that exercises the
real write path — `processed_checkouts` idempotency insert, service-role
writes, `add_stat` revenue RPC. Without Layer 2, Layer 3 applies listings to
the in-memory mock store and only tests webhook mechanics (still useful for
signature/cents/idempotency bugs).

Webhooks must reach a **public** URL — `localhost` won't work, and Vercel
deployment protection blocks them (they can't log in). Two options:

**a) Tunnel to local** (fastest iteration):

```bash
ngrok http 3000            # or: cloudflared tunnel --url http://localhost:3000
# Dodo test mode → webhook endpoint: https://<tunnel-id>.ngrok.io/api/webhooks/dodo
#   (subscribe to payment.succeeded)
```

**b) Preview deployment**: push a branch, open the Vercel preview URL, disable
deployment protection for it, point the sandbox webhook there.

Use Dodo's test card on the test-mode checkout and verify: checkout `amount`
equals the **difference** for raises (×100 cents), the webhook applies the
listing once (fire the same event twice → one apply), and `/success` lands back
on the board with the new rank. With Layer 2 running, also confirm in the local
Supabase Studio that `processed_checkouts` has the payment id, `activity` has
the row, and `site_stats.total_revenue` grew by the paid delta.

⚠️ **Test-mode webhooks fan out to every endpoint on the Dodo account.** Dodo
delivers each `payment.succeeded` to *all* test-mode endpoints — staging,
`outbidarabs.lol` and any local tunnel all receive everything, so a payment
made anywhere applies everywhere unless gated. Two protections are in place:
1. every checkout carries `metadata.env` (`local`/`staging`/`prod`, from
   `VERCEL_ENV` — see `src/lib/payments-env.ts`) and each webhook applies
   only events tagged for its own environment (skips return 200, no retry);
2. the test-mode endpoint pointing at `outbidarabs.lol` is **disabled** on the
   Dodo account — re-enable it only if prod must accept test payments again
   (not needed for live: live mode uses its own endpoints/keys).

**Simulating Dodo webhooks locally** — `scripts/simulate-dodo-webhook.mjs` signs a
`payment.succeeded` payload exactly like Dodo (Standard Webhooks HMAC-SHA256)
and drives the full path without a browser payment:

```bash
set -a; . ./.env; set +a
node scripts/simulate-webhook.mjs <amount> <identityUrl> <checkoutId-or-synthetic>
```

It sends four requests: valid (expect 200 + apply), replay (200, no double
apply), tampered body (403), bad signature (403).

### Layer 4 — Vercel preview / staging

**Staging is live at `staging.outbidarabs.lol`**: a hosted Supabase project
(`outbidarabs-staging`, real database, empty board) + Dodo test mode — the
full real product, money included (test cards), with data derived only from
actions taken on the site. The Dodo webhook points at
`https://staging.outbidarabs.lol/api/webhooks/dodo`.

⚠️ **Deploy with `bash scripts/deploy.sh [prod]`, never bare `vercel deploy`** —
the CLI uploads local `.env`/`.env.local` into the build, which would override
the project's Preview/Production env vars (local `NEXT_PUBLIC_MOCK_MODE=true`
and `localhost` Supabase URLs leak into the deployment). The script hides
local env files for the deploy and restores them after.

Env vars per target (Vercel → Settings → Environment Variables):
- **Preview**: staging Supabase keys + Dodo test_mode keys (staging webhook secret) + `SITE_URL=https://staging.outbidarabs.lol`
- **Production**: prod Supabase + Dodo live keys + `MOCK_MODE=false` (never set `ALLOW_MOCK_PAYMENTS`)

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
  prod Supabase URL/anon/service-role, `DODO_API_KEY` + `DODO_PRODUCT_ID`
  + `DODO_WEBHOOK_SECRET` + `DODO_ENVIRONMENT=live_mode`,
  `NEXT_PUBLIC_SITE_URL=https://outbidarabs.lol`, optional
  `NEXT_PUBLIC_LAUNCH_DATE`
- Supabase prod project: `schema.sql` applied, Realtime enabled for `listings`
  + `activity` — **and no seed data**: production launches empty (fictional
  bids/clicks/revenue must never be presented as real activity)
- Dodo live webhook `https://outbidarabs.lol/api/webhooks/dodo`
  subscribed to `payment.succeeded`; test once with a real small payment and
  refund it
- After first real webhook: confirm `total_revenue` grew and the activity feed
  has the row (this is what the earnings card displays)

**Production monitoring (manual for now — no alerts wired):**

- `/api/stats` — board size, top bid, revenue, online count
- Vercel dashboard → Deployments/Logs for runtime errors (webhook apply
  failures log `payment apply failed <paymentId> <reason>`)
- Dodo dashboard → payments vs. board: every captured payment should appear
  as a listing/raise; any mismatch = investigate immediately (money involved)
- Supabase dashboard → Table editor for `listings`/`activity`/`processed_checkouts`

**Rollback:** `vercel ls` → find the last known-good production URL →
`vercel alias set <old-deployment-url> outbidarabs.lol` (near-instant; DB
schema rollbacks are separate — apply reverse SQL carefully).

**Current state:** production is live on the real stack (prod Supabase +
Dodo test-mode payments + DataFast) with an **empty board** — the honest launch state.
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

It checks (38 layer-agnostic checks + 15 mock-layer rules/auth checks, exit 0
= pass; the mock-only rules/auth section self-skips on real-mode deployments
— layers 2–5 need a real inbox to log in; the one-probe classification uses
an example.com address that hosted Supabase rejects, so no real OTP email is
ever sent and the app refunds the consumed allowance):

1. Board renders: platform headline + filter pills + earnings card, listings
   carry `platform`
2. Platform filter: `?platform=instagram` returns only instagram listings
3. Preview API: URL → platform detection, bare `@handle` → ambiguous with
   candidates, platform hint resolves, post/short-link TikTok URLs rejected
4. Auth gate + rules engine: checkout without a session → 401
   `login_required` (every layer); send-code rejects invalid email, verify
   rejects a wrong code (every layer); mock layer adds devCode login →
   session jar, then bid at top+1 → accepted at rank #1 (highest bid wins),
   low bid accepted, raise accepted, raise ≤ current rejected — all
   authenticated. Stateful rules checks are skipped on layers 2–5 (they
   need a logged-in session; the example.com probe never consumes real OTP
   quota — hosted Supabase rejects the domain, and the app refunds the
   allowance on send failure)
5. Identity (via `/api/preview`, session-free — same detector as checkout):
   `about.me` allowed, `t.me` rejected, illegal-content hosts/path rejected
   (incl. Arabic paths), two Play Store `id`s canonicalize apart
6. `/go/[id]` redirects with `?utm_source=outbidarabs`
7. `/rules`, `/about` return 200 + raise-by-difference + origin-note copy;
   an unknown `/u/<id>` 404s
8. Accounts & privacy (mock layer only): `/api/auth/me` returns the email,
   card-state JSON free of emails/payer fields/auth uuids and free of any
   owner field (agnostic cards), attributed supporter rows keyed by the
   opaque `u:<public_id>` (never `u:<auth uuid>`), payment-status returns
   applied+attributed with no payerEmail/PII anywhere, `/u/` by public id
   (200) vs auth id (404)

**Serverless caveat:** mock mode keeps state in the lambda's memory, so on
Vercel each instance has its own board and stateful checks (raise/lookup) can
be inconclusive depending on instance affinity. The script detects this and
reports `⚠ inconclusive` instead of failing. Stateful checks are fully
reliable against local dev and any Supabase-backed deployment (layers 2–4).
Payment-only checks (checkout amount = difference, webhook idempotency) are
layer 3 and documented above — the script never calls Dodo.

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

Polar rejected the board under its "directories and boards" category, so Dodo
is the provider:

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

### 3. Vercel

```bash
npx vercel
```

Add all env vars from `.env.example` in the project settings and point
`NEXT_PUBLIC_SITE_URL` at the final domain. Optionally set
`NEXT_PUBLIC_LAUNCH_DATE` (ISO) — it feeds the earnings card and About page.

## Accounts (docs/accounts-workflow.md)

Email-code accounts built on Supabase Auth OTP. **Paying requires login;
browsing never does.** The gate appears only at the moment of commitment:
the claim form swaps inline to the email → 6-digit code step (no modal hop,
no page navigation), and the parked payment auto-resumes the moment the
verify succeeds — no extra click, nothing re-typed. Sessions last 30 days,
so returning supporters pay with zero added steps. Cards are agnostic: no
ownership — anyone can pay, anyone can boost.

- **Flow**: press pay while logged out → inline email-code step (the pending
  payment is parked verbatim: identity, amount, platform) → verify → the
  payment re-submits itself to `/api/checkout` with the fresh session → Dodo
  with the verified email prefilled (card details only) → webhook applies
  with `metadata.user_id` → already attributed, already on the supporters
  list. The gate is enforced server-side: anonymous `POST /api/checkout`
  returns `401 login_required` before any validation or provider work. A
  mid-flow session expiry re-opens the same gate (the client treats a 401 as
  "park + login", then auto-resumes).
- **`/api/payment-status`** is a bare poll for the success page —
  `{ applied, attributed }` only, no emails, tokens or PII on any path.
  `checkout_tokens` (from the removed cookie-reveal design) is now an unused
  vestige: the table stays in the schema for migration-history reasons but
  nothing writes or reads it.
- **Supporters drawer** (chevron on each board row, D9): users ranked by total
  paid to that card (ties: earliest first) — a pure ranking, no pinning.
  Private users render as "Anonymous / مجهول" with amounts visible (D8).
  The visit action stays `/go/[id]`. Card metadata is source-fetched and
  immutable after creation.
- **Profile** `/profile`: name, public toggle (default public, D3), read-only
  email, payments grouped per card with the user's supporters rank. Public
  page `/u/[id]` — private users 404.
- **Privacy**: `payments` and `profiles` have RLS with no public policies and
  revoked anon grants — the app touches them only via the service role.
  `profiles.id` is the auth uuid, so the table is not anon-readable (the anon
  key is public); public reads go through `supporters_view`, which resolves
  identities and never exposes `payer_email`. Public surfaces address users
  by the opaque `profiles.public_id` (`/u/[id]`, supporter rows, the view) —
  auth uuids
  never appear publicly (supporter row keys are `u:<public_id>` for users,
  server-side HMAC digests for anonymous groups), and old `/u/<auth-uuid>`
  links simply 404.
  Payments without a known payer email (the `anonymous@local` sentinel,
  which can never be backfilled to a real email) render as one anonymous
  supporter row per payment; other anonymous payments group per email
  digest (app API: server-side HMAC keys).
- **Known residuals** (accepted, tracked here so they survive the review
  loop): `checkout_tokens` is an unused vestige (nothing writes/reads it —
  migration history keeps the table; safe to drop in a future migration);
  `/api/payment-status` will proxy-retrieve a Dodo checkout session for any
  poll id it is handed (no PII is ever returned — just Dodo API load); mock
  smoke on multi-instance Vercel may hard-fail account checks instead of
  reporting inconclusive (mock-on-Vercel is not a supported layer); legacy
  anonymous payments from before the gate (staging only) stay attributed by
  the login-time backfill.
- **Env**: auth reuses the Supabase URL/anon key via `@supabase/ssr` cookie
  sessions; optional `ACCOUNTS_HASH_SECRET` (server-side HMAC secret for
  anonymous-supporter grouping keys — set a random value in production).
  OTP sends are rate-limited in real mode by the DB-backed `otp_rate_limit`
  table (5/hour/email, 60s resend cooldown — shared across serverless
  instances, consumed atomically by the `consume_otp_allowance` RPC with a
  `refund_otp_allowance` give-back on hard send failures; the in-memory
  limiter is mock-only) in addition to Supabase's
  own limits. **Auth email (staging + prod): custom SMTP via Resend**
  (`smtp.resend.com:465`, user `resend`, password = `RESEND_API_KEY` in
  `.env`), sender `noreply@outbidarabs.lol` (domain DKIM/SPF-verified in
  Resend), magic-link template renders the 6-digit `{{ .Token }}` code,
  OTP expiry 600s — configured through the Supabase Management API
  (template editing requires custom SMTP; free-tier built-in email is
  2/hour and link-based). Resend free tier: 100 emails/day. Inbound mail
  (e.g. `hello@outbidarabs.lol`) is NOT hosted by Resend — needs a
  forwarding/MX setup (ImprovMX etc.) before publishing that address
  as a contact.
  **Required auth-config state on every hosted project** (verify after any
  Supabase project creation or config migration — mismatches break login):
  `mailer_autoconfirm = true` (else first-time users get the link-based
  confirm-email instead of the code email — the link does nothing in our
  app), `mailer_otp_length = 6` (Supabase's newer default is 8, which the
  6-digit input rejects), `mailer_otp_exp = 600`, magic-link template =
  `supabase/templates/magic_link.html`.
- **Mock mode**: the whole flow works keyless — in-memory users/sessions/
  payments mirror the Supabase path, seeded with two demo supporters.
  The mock OTP code is returned by the API and shown in the UI (mock only).
  Login is required to pay in mock mode too (devCode login → checkout
  applies instantly with the session attribution).

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

## Smart fetching (preview card)

When an input is detected, `/api/preview` fetches public data for the card
(best effort — never blocks, 4.5s timeout, 10-minute server cache; the card is
view-only and shows what the platform returned, falling back to the handle):

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
icon + handle (view-only ground truth, exactly as the spec requires).

## Parity with the reference

- 50 rows per page + "1–50 of N" count + ↻ Refresh
- Platform filter pills (All | Instagram | TikTok | X | LinkedIn | Website | App)
  + platform badge on every listing avatar
- Earnings card ("The Arab outbid board has made $X since its launch…")
- Real images: smart-fetch avatar/icon captured at submission (read-only in the
  preview card; metadata always comes from the server) → favicon → letter fallback
- Clicks redirect through `/go/[id]` with `utm_source=outbidarabs` appended
- Live "online" counter via presence heartbeats (75s window)
- Public analytics dashboard: `see stats →` pill + footer `Live stats` link to
  `NEXT_PUBLIC_ANALYTICS_URL` (reference uses Vemetric public dashboards);
  provider script injected via `NEXT_PUBLIC_ANALYTICS_SCRIPT_URL` +
  `NEXT_PUBLIC_ANALYTICS_SITE_ID` (DataFast, Vemetric, Plausible — any)
- Claim-form UX: detection → platform chips for ambiguous handles → view-only
  preview card showing name/bio/avatar fetched from the platform + cleaned
  destination URL; metadata is decided server-side (existing listing or
  server-side fetch), never client edits;
  the amount field is always what you PAY — the full bid for a new card, or
  just the raise delta for a card already on the board ("Already on the
  board at $X. Checkout only charges the $N difference." → the button says
  "Boost it for $N"), with the top-3 level chips quoting each spot's exact
  delta; pressing pay while logged out swaps the form inline to the email-code
  login step and auto-resumes the parked payment after verify (see Accounts)
- Boost pill on every row: defaults to the delta that lifts the card one
  level (beat the listing directly above +$1, pay only the difference —
  under ties that can jump several ranks); #1 falls back to +$1 on the lead

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
      checkout/              # session-gated validation + Dodo checkout (charges difference)
      preview/               # platform detection + smart fetch + re-bid context
      webhooks/dodo/         # payment.succeeded → listing (idempotent, race-safe)
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
