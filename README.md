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

Mock mode runs the entire site self-contained: seeded leaderboard, live activity
simulation, mock checkout (bids apply instantly through the real rules engine),
click tracking. Perfect for local development and demos.

## Going live

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL editor (tables, indexes, RLS, functions)
3. Optionally run `supabase/seed.sql` for a populated board
4. Copy **Settings → API**: project URL + anon key into `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the service-role key into
   `SUPABASE_SERVICE_ROLE_KEY` (server writes: webhook + click redirect)
5. Enable Realtime for the `listings` and `activity` tables (Database → Replication)

### 2. Polar

1. Create an account at [polar.sh](https://polar.sh) (sandbox first)
2. Create a product **"Outbid Spot"** with a **custom price** (minimum $5)
3. Copy the product ID into `POLAR_PRODUCT_ID`, a token into `POLAR_ACCESS_TOKEN`
4. Add a webhook endpoint `https://yourdomain.com/api/webhooks/polar`
   subscribed to **checkout** events, copy the secret into `POLAR_WEBHOOK_SECRET`
5. Set `POLAR_ENVIRONMENT=production` when live and `NEXT_PUBLIC_MOCK_MODE=false`

Flow: claim form → `POST /api/checkout` (validates identity, strips tracking
params, fetches og:description) → Polar-hosted checkout for the exact amount →
webhook `checkout.updated` (status `succeeded`) → listing created/raised →
Realtime pushes the new board to every visitor.

### 3. Vercel

```bash
npx vercel
```

Add all env vars from `.env.example` in the project settings and point
`NEXT_PUBLIC_SITE_URL` at the final domain.

## Rules engine (mirrors outbid.lol exactly)

- Whole dollars, **$5 minimum**, **$999,999 maximum**
- Taking #1 costs current top bid **+ $5**; lower bids land at the rank they can reach
- Equal bids: the older bid keeps the higher rank (`ORDER BY bid_amount DESC, last_bid_at ASC`)
- Re-submitting the same URL/handle raises the bid (pay only the difference, +$1 minimum)
- Platform links (App Store / Play Store / GitHub) keyed by path
- Tracking/affiliate params stripped automatically
- Forbidden: chat & invite links (Telegram/WhatsApp/Discord/…), NSFW, shorteners

## Project layout

```
src/
  app/
    page.tsx                 # leaderboard homepage
    rules/ about/ success/   # static pages
    api/
      checkout/              # identity validation + Polar checkout (or mock)
      webhooks/polar/        # payment → listing
      board/ stats/ visit/   # live data endpoints
    go/[id]/                 # click tracking redirect
  components/                # exact outbid.lol-style UI components
  lib/
    store.ts                 # Supabase + mock data layer + rules engine
    identity.ts              # URL/@handle normalization & moderation
    i18n.ts                  # AR/EN dictionary
supabase/
  schema.sql seed.sql
```
