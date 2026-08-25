-- Deferred hardening pass (review follow-ups on 20250824000001_accounts):
--  · otp_rate_limit   — DB-backed OTP send limits (5/hour/email + 60s cooldown)
--  · checkout_tokens  — payment-status cookie binding: the payer email is
--                       revealed only to the browser that initiated the
--                       checkout (it holds the matching token cookie)
--  · profiles.public_id — opaque public ids so auth uuids never appear on a
--                       public surface (/u/[id], supporter rows, the view)
--  · supporters_view  — one row per no-email payment (sentinel) instead of
--                       merging them, and public ids instead of auth uuids

-- ── OTP rate limiting (real mode; the in-memory map stays mock-only) ──
create table if not exists otp_rate_limit (
  email text primary key,
  sends integer not null default 0,
  window_start timestamptz not null default now(),
  last_sent_at timestamptz not null default now()
);

-- ── Checkout cookie tokens ──
-- Keyed by the Dodo payment id (written by the webhook apply; the token
-- travels in checkout metadata) or the mock order id. payment-status matches
-- the browser's pay_* cookie VALUE against the stored token — the cookie
-- name doesn't have to match the id the client polls with.
create table if not exists checkout_tokens (
  checkout_id text primary key,
  token text not null,
  created_at timestamptz not null default now()
);

-- ── Opaque public ids ──
-- Existing rows are backfilled by the column default.
alter table profiles add column if not exists public_id uuid not null default gen_random_uuid();
create unique index if not exists profiles_public_id_idx on profiles (public_id);

-- ── supporters_view: per-payment sentinel rows + public ids ──
-- Replaces the accounts-migration definition: no-email payments (the
-- anonymous@local sentinel, which can never be backfilled to a real email)
-- become one row per payment; every other anonymous group stays keyed by an
-- email digest; user rows expose the opaque public_id, never the auth uuid.
-- Digests live only in the GROUP BY key — no email-derived value is selected.
-- (drop first: or-replace cannot rename the old user_id column.)
drop view if exists supporters_view;
create view supporters_view as
select
  p.listing_id,
  pr.public_id as public_id,
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
  coalesce(
    p.user_id::text,
    case when lower(p.payer_email) = 'anonymous@local'
      then 'c:' || md5(p.checkout_id)
      else 'e:' || md5(lower(p.payer_email))
    end
  ),
  pr.public_id,
  pr.display_name,
  pr.avatar_url,
  pr.is_public;

-- The drop+recreate above lost the explicit grant from the accounts
-- migration — re-grant so anon readability doesn't depend on default
-- privileges.
grant select on supporters_view to anon, authenticated;

-- ── RLS + privileges: both tables are service-role only ──
alter table otp_rate_limit enable row level security;
alter table checkout_tokens enable row level security;
-- No anon/authenticated policies. schema.sql blanket-grants select on all
-- tables to anon after this point runs — the revokes there handle it; keep
-- explicit revokes here too so a migration-only apply is also locked down.
revoke all on otp_rate_limit from anon, authenticated;
revoke all on checkout_tokens from anon, authenticated;
