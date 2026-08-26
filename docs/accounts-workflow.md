# Accounts — refined workflow spec

> **ADDENDUM (2026-08-24) — login required at the moment of payment.**
> D5 below is **superseded**: paying now requires email-code login; browsing
> and previewing stay anonymous. The gate is placed at the moment of
> commitment and delivered with minimum friction: the claim form swaps
> **inline** to email → 6-digit code (no modal hop, no navigation), the
> pending payment is parked verbatim and **auto-resumes** on verify (no extra
> click), Dodo gets the verified email prefilled (card details only), and the
> 30-day session means returning payers see zero added steps.
> `/api/checkout` enforces the session server-side (`401 login_required`
> before any validation or provider work) — the gate is not UI-only.
>
> **Decisions made with this change:**
> - The post-payment signup prompt, `pay_*` cookie binding, and the
>   `payment-status` email reveal were **deleted** as obsolete (attribution
>   now happens at checkout via the session). `/api/payment-status` is a bare
>   `{ applied, attributed }` poll. `checkout_tokens` stays in the schema as
>   an unused vestige (append-only migration history; nothing reads/writes
>   it).
> - `backfillPayments` stays as a safety net: legacy anonymous payments
>   (pre-gate staging rows) and a session that expires between checkout and
>   webhook still attribute on the next login with the same email.
> - `payments.payer_email` keeps being recorded (webhook customer email /
>   metadata email) as attribution fallback — with the gate it is always a
>   verified address.
> - The header "Log in" button stays (pre-login for eager users).

Status: SHIPPED, with superseding decisions — **cards are agnostic:
no ownership** (D1/D2/D6 below are superseded) and **login is required at the
moment of payment** (D5 superseded, see addendum above). Open decisions
marked **[D#]** below, recommendations included.
Terminology: "card" (user-facing) = `listings` row (code). "Supporter" = anyone
who paid toward a card. ("Owner" = removed concept: a card belongs to no one.)

## Core principle

**Login at the moment of commitment, nothing before it.** Browsing and
previewing are fully anonymous; the only gate is the pay button, which swaps
the form inline to email → 6-digit code, parks the payment verbatim and
auto-resumes it on verify (see the addendum above). Accounts exist to put a
name on your support and manage your profile — never to browse.

## Flows

### 1. Supporter pays (the default path — login at the moment of commitment)
1. Land on board → type handle → preview card → amount → **press pay**.
2. Logged out? The form swaps inline to the email step → 6-digit code →
   verify. The parked payment (identity, amount, platform) auto-resumes —
   no extra click — and Dodo asks only for the card (email prefilled).
3. Webhook (`payment.succeeded`) applies the payment **already attributed**
   (`metadata.user_id` + verified email). The success page confirms and
   returns to the board; there is nothing left to opt into.

(Pre-gate flow — anonymous pay + post-payment prompt — removed; see the
addendum.)

### 2. Logged-in user pays
- Press pay → straight to Dodo (card only). No gate, no prompt.
- `metadata.user_id` + prefilled customer email attribute the payment at the
  webhook. No post-payment step needed.

### 3. Owner claims a card — **REMOVED (agnostic cards)**
Superseded: there is no ownership notion. Anyone can pay toward any card;
the first payer's submission fixes the (source-fetched) metadata and nobody
can edit it afterward. The `claims` table and the "This is me" flow were
removed in `migrations/20250824000004_no_claims.sql`.

### 4. Profile (`/profile`, private to the user)
- Editable: display name, avatar, public/private toggle. Email shown
  read-only (it's the login key). Nothing else. **[D4]**
- **My payments**: every succeeded payment, grouped per card — card, amount,
  date, and the user's rank on that card's supporters list. **[D7]**
- Public profile (`/u/[id]`): name, avatar, cards supported with totals.
  Visible **only** if public; private users have no public page at
  all (404). On card supporters lists, private users appear as
  "Anonymous / مجهول" with amounts visible. **[D3, D8]**

### 5. Card supporters list (new surface)
- Every card gets a ranked list of users who paid toward it, ordered by
  total paid to that card (ties: earliest payment first).
- Anonymous rows: "Anonymous" + amount. Pure ranking — no badges, no pinning.
- Surface: expandable row / drawer on the board, keeping the existing
  `/go/[id]` click-through as the separate "visit" action. **[D9]**

## Data model delta (Supabase)

```sql
-- public.profiles (1:1 with auth.users, created on first login)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  is_public boolean not null default true,          -- [D3]
  created_at timestamptz not null default now()
);

-- payments: one row per succeeded payment (replaces nothing; new)
create table payments (
  id bigint generated always as identity primary key,
  checkout_id text unique not null,                  -- idempotency, joins processed_checkouts
  listing_id uuid not null references listings(id) on delete cascade,
  user_id uuid references profiles(id),              -- null until email match / signup
  payer_email text not null,                         -- from Dodo payload or session
  amount integer not null,                           -- what was actually charged
  created_at timestamptz not null default now()
);

-- ownership claims — REMOVED (agnostic cards, 20250824000004_no_claims.sql);
-- no table replaces it.

-- Supporters ranking per card: view over payments grouped by
-- coalesce(user_id, payer_email hash) — collapses anonymous pre-signup
-- payments into the user once user_id is backfilled at signup.
```

- Backfill rule: on successful email-code login, `update payments set
  user_id = … where payer_email = auth email and user_id is null`. The code
  proves email ownership → attribution is safe.
- Auth: **Supabase Auth email OTP** (6-digit code) — no new vendor. RLS
  (shipped, after the lockdown pass): `profiles`, `payments`,
  `otp_rate_limit`, `checkout_tokens` are all **service-role only** (RLS on,
  no anon/authenticated policies, grants revoked) — the app reads/writes
  them exclusively through service-role routes; public supporters data
  leaves only via `supporters_view` / the card API with opaque ids, amounts
  and resolved display identity — never raw emails or auth uuids.
- Avatar: generated (initial + gradient) at signup; upload later. **[D4]**

## Open decisions

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | Owner verification: honor system (login = claim) vs bio-code proof vs domain/email match | ~~Honor system now~~ **SUPERSEDED: no ownership at all — agnostic cards** |
| D2 | One owner per card vs multiple claimants | ~~Exactly one owner~~ **SUPERSEDED: no owners — anyone pays, anyone boosts** |
| D3 | New users public or private by default | **Public** — recognition is the growth engine; prominent toggle; amounts always visible either way |
| D4 | Avatar: generated-only vs upload (moderation + storage) | Generated initials/gradient first (zero moderation); upload as fast-follow |
| D5 | Gate: is login ever required? | ~~Only to manage a profile~~ **SUPERSEDED: login is required at the moment of payment** (inline gate + auto-resume; browsing stays anonymous — see addendum) |
| D6 | Does claiming grant card edit rights? | ~~Yes for description/image~~ **SUPERSEDED: no edits — metadata is source-fetched and immutable after creation** |
| D7 | Profile shows refunds/failed? | Succeeded only (matches webhook path) |
| D8 | Private user on a supporters list | "Anonymous" + amount; nobody can unmask |
| D9 | Supporters list surface | Expandable row/drawer; visit stays a separate click (keeps analytics) |
| D10 | Email sender for codes | Supabase Auth OTP; custom SMTP (Resend) before launch — free-tier auth email limits will bite |
| D11 | Existing prod data | Untouched; all pre-accounts payments stay anonymous (board is empty today — cheap to decide now) |

## Login mechanics (proposed defaults)

6-digit code, 10-min expiry, 60s resend cooldown, rate-limit 5/hour/email,
session 30 days, Supabase Auth email template branded AR/EN.
