-- Accounts & claims (docs/accounts-workflow.md): profiles, payments, claims.
-- Email-code accounts (Supabase Auth OTP). payments links every succeeded
-- Dodo checkout to its listing + payer email; claims give a card exactly one
-- owner. payer_email must never be publicly readable — public reads go
-- through supporters_view, which resolves identities only.

-- ── Profiles (1:1 with auth.users, created on first login) ──
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Payments: one row per succeeded payment ──
create table if not exists payments (
  id bigint generated always as identity primary key,
  checkout_id text unique not null,          -- Dodo payment id (idempotency key)
  listing_id uuid not null references listings(id) on delete cascade,
  user_id uuid references profiles(id),      -- null until the payer logs in (backfill)
  payer_email text not null,                 -- from the Dodo payload or checkout session
  amount integer not null check (amount > 0), -- what was actually charged
  created_at timestamptz not null default now()
);
create index if not exists payments_listing_idx on payments (listing_id, amount desc);
create index if not exists payments_user_idx on payments (user_id);
create index if not exists payments_email_idx on payments (lower(payer_email));

-- ── Claims: exactly one owner per card (listing_id is the PK) ──
create table if not exists claims (
  listing_id uuid primary key references listings(id) on delete cascade,
  user_id uuid not null references profiles(id),
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists claims_user_idx on claims (user_id);

-- ── Public supporters surface ──
-- payments itself stays locked (RLS enabled, no policies, revoked grants):
-- the public reads only this view, which resolves user identities and never
-- exposes payer_email. Private profiles resolve to anonymous (null name).
-- Grouping mirrors the app's rankSupporters: one row per (card, user) or
-- (card, payer email) — coalesce on an email digest so anonymous payments
-- from the same email collapse together. The digest is never selected: it
-- exists only in the GROUP BY key, so no email-derived value is exposed.
create or replace view supporters_view as
select
  p.listing_id,
  max(p.user_id::text)::uuid as user_id,
  case when coalesce(pr.is_public, false) then nullif(pr.display_name, '') end as display_name,
  case when coalesce(pr.is_public, false) then pr.avatar_url end as avatar_url,
  coalesce(pr.is_public, false) as is_public,
  sum(p.amount)::bigint as total_paid,
  min(p.created_at) as first_paid_at,
  max(p.created_at) as last_paid_at
from payments p
left join profiles pr on pr.id = p.user_id
group by
  p.listing_id,
  coalesce(p.user_id::text, 'e:' || md5(lower(p.payer_email))),
  pr.display_name,
  pr.avatar_url,
  pr.is_public;

-- ── RLS ──
alter table profiles enable row level security;
alter table payments enable row level security;
alter table claims enable row level security;

drop policy if exists "profiles public or self read" on profiles;
create policy "profiles public or self read" on profiles
  for select using (is_public or id = auth.uid());
drop policy if exists "profiles self insert" on profiles;
create policy "profiles self insert" on profiles
  for insert with check (id = auth.uid());
drop policy if exists "profiles self update" on profiles;
create policy "profiles self update" on profiles
  for update using (id = auth.uid());

drop policy if exists "public read claims" on claims;
create policy "public read claims" on claims for select using (true);
-- payments: no anon/authenticated policies — service-role writes only
-- (webhook + login backfill); public reads go through supporters_view.

-- ── Privileges ──
-- schema.sql blanket-grants select on all tables to anon; lock payments down
-- (RLS would already deny rows, the revoke is defense in depth) and expose
-- only the resolved-identity view.
revoke select on payments from anon, authenticated;
grant select on supporters_view to anon, authenticated;
