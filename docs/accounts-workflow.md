# Accounts & Claims — refined workflow spec

Status: DRAFT — open decisions marked **[D#]** below, recommendations included.
Terminology: "card" (user-facing) = `listings` row (code). "Supporter" = anyone
who paid toward a card. "Owner" = user who claimed the card as theirs.

## Core principle

**Never block payment behind login.** Accounts are optional and created
*after* value is delivered. Dodo already collects the payer's email at
checkout — that email is the attribution key, so the account is ~free for the
user: one 6-digit code after payment, or later, claims all past payments.

## Flows

### 1. Anonymous supporter pays (the default path — zero login friction)
1. Land on board → type handle → preview card → amount → Dodo checkout
   (Dodo requires the payer's email here anyway).
2. Webhook (`payment.succeeded`) applies the payment as today **and** records
   `payments.payer_email` from the Dodo payload (currently discarded).
3. Success page shows payment result + a non-blocking prompt:
   "Want your name on the supporters list? We sent a code to **you@x.com**"
   → single input, enter 6-digit code → account exists, profile pre-filled,
   every payment with that email auto-attributed.
4. If they skip: they show as **Anonymous** on the card's supporters list
   (amount still visible). They can claim later — same email → same payments.

### 2. Logged-in user pays
- `customer_email` is passed to the Dodo checkout session; webhook attributes
  directly. No post-payment step needed.
- Login is only ever *prompted*, never *required*, for supporting.

### 3. Owner claims a card
- Card detail → "This is me / هذا حسابي" → email-code login (claiming
  requires an account; supporting does not).
- Claim stores `claims(listing_id, user_id)` — **exactly one owner per card**
  (first-come; conflicts resolved manually via existing takedown backstop).
- Owner gets: verified badge on the card, pinned top slot on the supporters
  list if they've paid, and edit rights over card description/image
  (never the URL). **[D1, D6]**

### 4. Profile (`/profile`, private to the user)
- Editable: display name, avatar, public/private toggle. Email shown
  read-only (it's the login key). Nothing else. **[D4]**
- **My payments**: every succeeded payment, grouped per card — card, amount,
  date, and the user's rank on that card's supporters list. **[D7]**
- **My claims**: cards the user owns, with their current board rank.
- Public profile (`/u/[id]`): name, avatar, cards supported with totals,
  claims. Visible **only** if public; private users have no public page at
  all (404). On card supporters lists, private users appear as
  "Anonymous / مجهول" with amounts visible. **[D3, D8]**

### 5. Card supporters list (new surface)
- Every card gets a ranked list of users who paid toward it, ordered by
  total paid to that card (ties: earliest payment first).
- Anonymous rows: "Anonymous" + amount. Owner (if claimed): badge + pinned.
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

-- ownership claims
create table claims (
  listing_id uuid primary key references listings(id) on delete cascade,
  user_id uuid not null references profiles(id),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- Supporters ranking per card: view over payments grouped by
-- coalesce(user_id, payer_email hash) — collapses anonymous pre-signup
-- payments into the user once user_id is backfilled at signup.
```

- Backfill rule: on successful email-code login, `update payments set
  user_id = … where payer_email = auth email and user_id is null`. The code
  proves email ownership → attribution is safe.
- Auth: **Supabase Auth email OTP** (6-digit code) — no new vendor. RLS
  (shipped, after the lockdown pass): `profiles`, `claims`, `payments`,
  `otp_rate_limit`, `checkout_tokens` are all **service-role only** (RLS on,
  no anon/authenticated policies, grants revoked) — the app reads/writes
  them exclusively through service-role routes; public supporters data
  leaves only via `supporters_view` / the card API with opaque ids, amounts
  and resolved display identity — never raw emails or auth uuids.
- Avatar: generated (initial + gradient) at signup; upload later. **[D4]**

## Open decisions

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | Owner verification: honor system (login = claim) vs bio-code proof vs domain/email match | Honor system now; badge says "claimed" not "verified"; add bio-verification later. Zero friction, disputes handled by existing manual takedown |
| D2 | One owner per card vs multiple claimants | Exactly one owner + unlimited supporters ("one to many" = one card, many users) |
| D3 | New users public or private by default | **Public** — recognition is the growth engine; prominent toggle; amounts always visible either way |
| D4 | Avatar: generated-only vs upload (moderation + storage) | Generated initials/gradient first (zero moderation); upload as fast-follow |
| D5 | Gate: is login ever required? | Only to claim ownership & manage profile. Supporting stays anonymous forever |
| D6 | Does claiming grant card edit rights? | Yes for description/image; URL immutable (URL change = new card) |
| D7 | Profile shows refunds/failed? | Succeeded only (matches webhook path) |
| D8 | Private user on a supporters list | "Anonymous" + amount; even card owner cannot unmask |
| D9 | Supporters list surface | Expandable row/drawer; visit stays a separate click (keeps analytics) |
| D10 | Email sender for codes | Supabase Auth OTP; custom SMTP (Resend) before launch — free-tier auth email limits will bite |
| D11 | Existing prod data | Untouched; all pre-accounts payments stay anonymous (board is empty today — cheap to decide now) |

## Login mechanics (proposed defaults)

6-digit code, 10-min expiry, 60s resend cooldown, rate-limit 5/hour/email,
session 30 days, Supabase Auth email template branded AR/EN.
