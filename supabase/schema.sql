-- outbidarabs.lol — Supabase schema
create extension if not exists "pgcrypto";

-- ── Listings ──────────────────────────────────────────────
create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  url text not null,                    -- clean url or @handle
  display_name text not null,           -- domain or @handle shown
  description text,                     -- optional Arabic/English
  bid_amount integer not null check (bid_amount between 1 and 999999),
  clicks integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_bid_at timestamptz not null default now(),
  polar_order_id text,
  is_active boolean not null default true,
  unique (url)
);
alter table listings add column if not exists target_url text;  -- click-through href
alter table listings add column if not exists image_url text;   -- og:image / profile pic
-- Platform-focused board: instagram | tiktok | x | linkedin | website | app
alter table listings add column if not exists platform text not null default 'website';
-- Backfill platform from the canonical url (idempotent).
update listings set platform = case
  when url like 'https://instagram.com/%' then 'instagram'
  when url like 'https://tiktok.com/%' then 'tiktok'
  when url like 'https://x.com/%' or url like 'https://twitter.com/%' then 'x'
  when url like 'https://linkedin.com/%' then 'linkedin'
  when url like 'https://apps.apple.com/%'
    or url like 'https://play.google.com/%' then 'app'
  else 'website'
end;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'listings_platform_check'
  ) then
    alter table listings add constraint listings_platform_check
      check (platform in ('instagram', 'tiktok', 'x', 'linkedin', 'website', 'app'));
  end if;
end $$;

-- Equal bids: older bid keeps the higher rank → order by bid_amount desc, last_bid_at asc
create index if not exists listings_rank_idx on listings (is_active, bid_amount desc, last_bid_at asc);
create index if not exists listings_last_bid_idx on listings (last_bid_at desc);
create index if not exists listings_platform_idx on listings (platform, is_active, bid_amount desc);

-- ── Clicks (analytics) ────────────────────────────────────
create table if not exists clicks (
  id bigint generated always as identity primary key,
  listing_id uuid not null references listings(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists clicks_listing_time_idx on clicks (listing_id, created_at desc);

-- ── Activity feed (new bids) ──────────────────────────────
create table if not exists activity (
  id bigint generated always as identity primary key,
  listing_id uuid not null references listings(id) on delete cascade,
  display_name text not null,
  amount integer not null,
  rank integer not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_time_idx on activity (created_at desc);

-- ── Processed checkouts (webhook idempotency) ──────────────
create table if not exists processed_checkouts (
  checkout_id text primary key,
  processed_at timestamptz not null default now()
);

-- ── Presence (online counter) ─────────────────────────────
create table if not exists presence (
  session_id text primary key,
  last_seen timestamptz not null default now()
);

-- ── Site stats ────────────────────────────────────────────
create table if not exists site_stats (
  key text primary key,
  value bigint not null default 0
);
insert into site_stats (key, value) values
  ('visitors', 0),
  ('total_revenue', 0)
on conflict (key) do nothing;

-- ── Ranking helper: rank of every active listing ──────────
-- Hosted Supabase grants EXECUTE on public functions to anon/authenticated
-- (platform-managed privileges that override plain REVOKE), so writer RPCs
-- guard themselves with assert_service_role() instead of relying on grants.
create or replace function assert_service_role() returns void
language plpgsql stable as $$
begin
  if coalesce(current_setting('role', true), '') not in ('service_role', 'postgres', 'none') then
    raise exception 'forbidden: service role required';
  end if;
end;
$$;

create or replace function listing_rank(target uuid) returns integer
language sql stable as $$
  select count(*) + 1
  from listings l
  where l.is_active
    and l.id <> target
    and (l.bid_amount, l.last_bid_at) > (
      select x.bid_amount, x.last_bid_at from listings x where x.id = target
    );
$$;

-- Increment clicks + record the click event atomically
create or replace function register_click(p_listing uuid) returns void
language plpgsql security definer as $$
begin
  perform assert_service_role();
  update listings set clicks = clicks + 1 where id = p_listing;
  insert into clicks (listing_id) values (p_listing);
end;
$$;

-- Increment a site_stats counter, returns the new value
create or replace function bump_stat(p_key text) returns bigint
language plpgsql security definer as $$
declare
  new_value bigint;
begin
  perform assert_service_role();
  insert into site_stats (key, value) values (p_key, 1)
  on conflict (key) do update set value = site_stats.value + 1
  returning value into new_value;
  return new_value;
end;
$$;

-- Add a delta to a site_stats counter (revenue tracking)
create or replace function add_stat(p_key text, p_delta bigint) returns bigint
language plpgsql security definer as $$
declare
  new_value bigint;
begin
  perform assert_service_role();
  insert into site_stats (key, value) values (p_key, greatest(p_delta, 0))
  on conflict (key) do update set value = site_stats.value + greatest(p_delta, 0)
  returning value into new_value;
  return new_value;
end;
$$;

-- Presence heartbeat: upsert the session, prune stale rows, return online count
create or replace function heartbeat(p_session text) returns integer
language plpgsql security definer as $$
begin
  perform assert_service_role();
  insert into presence (session_id, last_seen) values (p_session, now())
  on conflict (session_id) do update set last_seen = now();
  delete from presence where last_seen < now() - interval '1 hour';
  return (select count(*) from presence where last_seen > now() - interval '75 seconds');
end;
$$;

-- Read-only online count
create or replace function count_online() returns integer
language sql stable security definer as $$
  select count(*)::int from presence where last_seen > now() - interval '75 seconds';
$$;

-- ── Realtime: broadcast board + activity changes to every visitor ──
-- (hosted equivalent: Database → Replication → enable the two tables)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'listings') then
    alter publication supabase_realtime add table listings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'activity') then
    alter publication supabase_realtime add table activity;
  end if;
end $$;

-- ── RLS ───────────────────────────────────────────────────
alter table listings enable row level security;
alter table clicks enable row level security;
alter table activity enable row level security;
alter table site_stats enable row level security;
alter table presence enable row level security;
alter table processed_checkouts enable row level security;

-- Public read (drop first so the file can be re-pasted safely)
drop policy if exists "public read listings" on listings;
drop policy if exists "public read clicks" on clicks;
drop policy if exists "public read activity" on activity;
drop policy if exists "public read stats" on site_stats;
create policy "public read listings" on listings for select using (true);
create policy "public read clicks" on clicks for select using (true);
create policy "public read activity" on activity for select using (true);
create policy "public read stats" on site_stats for select using (true);
-- No public access: presence, processed_checkouts and all writes go through
-- the service role (webhooks / API routes).

-- Grants: RLS policies alone are not enough — tables created by postgres are
-- not readable by anon without explicit privileges.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant select on tables to anon, authenticated;
-- Service role bypasses RLS but still needs privileges for writes
grant usage, select on all sequences in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- Functions default to EXECUTE for PUBLIC — revoke from PUBLIC (anon and
-- authenticated inherit it) and grant only to the service role, so nobody can
-- inflate revenue/visitors/presence from the client.
revoke execute on function bump_stat(text) from public;
revoke execute on function add_stat(text, bigint) from public;
revoke execute on function heartbeat(text) from public;
revoke execute on function register_click(uuid) from public;
revoke execute on function count_online() from public;
revoke execute on function listing_rank(uuid) from public;
-- (Best-effort only — hosted Supabase re-grants EXECUTE to anon via platform
-- privileges; the real enforcement is assert_service_role() in each body.)
grant execute on function bump_stat(text) to service_role;
grant execute on function add_stat(text, bigint) to service_role;
grant execute on function register_click(uuid) to service_role;
grant execute on function count_online() to service_role;
grant execute on function listing_rank(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════
-- Accounts (docs/accounts-workflow.md) — cards are agnostic: no claims /
-- ownership (dropped in migrations/20250824000004_no_claims.sql)
-- ═══════════════════════════════════════════════════════════

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

-- (No claims table: cards are agnostic — anyone pays, anyone boosts.)

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

drop policy if exists "profiles public or self read" on profiles;
create policy "profiles public or self read" on profiles
  for select using (is_public or id = auth.uid());
drop policy if exists "profiles self insert" on profiles;
create policy "profiles self insert" on profiles
  for insert with check (id = auth.uid());
drop policy if exists "profiles self update" on profiles;
create policy "profiles self update" on profiles
  for update using (id = auth.uid());

-- payments: no anon/authenticated policies — service-role writes only
-- (webhook + login backfill); public reads go through supporters_view.

-- ── Privileges (after the blanket grants above, on purpose) ──
revoke select on payments from anon, authenticated;
grant select on supporters_view to anon, authenticated;

-- ───────────────────────────────────────────────────────────
-- Deferred hardening (mirrors migrations/20250824000002_deferred.sql)
-- ───────────────────────────────────────────────────────────

-- OTP rate limiting (real mode; the in-memory limiter stays mock-only)
create table if not exists otp_rate_limit (
  email text primary key,
  sends integer not null default 0,
  window_start timestamptz not null default now(),
  last_sent_at timestamptz not null default now()
);

-- Checkout cookie tokens: payment-status reveals the payer email only to the
-- browser holding the matching pay_* cookie VALUE for the stored token.
-- UNUSED VESTIGE (login-gate change): nothing reads or writes this table.
-- Kept only because migration history is append-only — safe to drop in a
-- future migration.
create table if not exists checkout_tokens (
  checkout_id text primary key,
  token text not null,
  created_at timestamptz not null default now()
);

-- Opaque public ids (backfilled by the column default)
alter table profiles add column if not exists public_id uuid not null default gen_random_uuid();
create unique index if not exists profiles_public_id_idx on profiles (public_id);

-- supporters_view (replaces the accounts-section definition above): one row
-- per no-email payment (sentinel), email-digest rows otherwise, and public
-- ids instead of auth uuids. Digests exist only in the GROUP BY key.
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

-- Recreating the view dropped the grant from the accounts section above —
-- re-grant explicitly so anon readability survives the recreate.
grant select on supporters_view to anon, authenticated;

-- New tables land after the blanket grants above — lock them down (payments
-- keeps its own revoke from the accounts section).
alter table otp_rate_limit enable row level security;
alter table checkout_tokens enable row level security;
revoke all on otp_rate_limit from anon, authenticated;
revoke all on checkout_tokens from anon, authenticated;

-- ───────────────────────────────────────────────────────
-- Lockdown (mirrors migrations/20250824000003_lockdown.sql)
-- ───────────────────────────────────────────────────────

-- profiles → service-role only: profiles carries auth uuids and the anon
-- key is public, so the "public read" policy exposed the uuid↔public_id
-- mapping. The app reads the table only via the service role
-- (src/lib/accounts.ts); public surfaces use public_id. The
-- self-insert/self-update policies go too (no authenticated-direct path
-- exists). supporters_view keeps working (view-owner privileges).
drop policy if exists "profiles public or self read" on profiles;
drop policy if exists "profiles self insert" on profiles;
drop policy if exists "profiles self update" on profiles;
revoke select on profiles from anon, authenticated;

-- Atomic OTP window/cooldown/increment (replaces the app's racy
-- read→check→upsert). Returns
-- {"allowed":true,"sends":N} | {"allowed":false,"reason":…,"retry_after_sec":N}.
create or replace function consume_otp_allowance(
  p_email text,
  p_max_sends integer,
  p_window_sec integer,
  p_cooldown_sec integer
) returns json
language plpgsql security definer as $$
declare
  v_now timestamptz := now();
  v_window_cutoff timestamptz := v_now - make_interval(secs => p_window_sec);
  v_cooldown_cutoff timestamptz := v_now - make_interval(secs => p_cooldown_sec);
  v_sends integer;
  v_window_start timestamptz;
  v_last_sent_at timestamptz;
  v_retry integer;
begin
  perform assert_service_role();

  update otp_rate_limit
  set
    sends = case when window_start <= v_window_cutoff then 1 else sends + 1 end,
    window_start = case when window_start <= v_window_cutoff then v_now else window_start end,
    last_sent_at = v_now
  where email = p_email
    and (
      window_start <= v_window_cutoff
      or (sends < p_max_sends and last_sent_at <= v_cooldown_cutoff)
    )
  returning sends, window_start, last_sent_at into v_sends, v_window_start, v_last_sent_at;

  if found then
    return json_build_object('allowed', true, 'sends', v_sends);
  end if;

  select sends, window_start, last_sent_at
    into v_sends, v_window_start, v_last_sent_at
  from otp_rate_limit where email = p_email;

  if not found then
    insert into otp_rate_limit (email, sends, window_start, last_sent_at)
    values (p_email, 1, v_now, v_now)
    on conflict (email) do nothing
    returning sends into v_sends;
    if found then
      return json_build_object('allowed', true, 'sends', 1);
    end if;
    update otp_rate_limit
    set
      sends = case when window_start <= v_window_cutoff then 1 else sends + 1 end,
      window_start = case when window_start <= v_window_cutoff then v_now else window_start end,
      last_sent_at = v_now
    where email = p_email
      and (
        window_start <= v_window_cutoff
        or (sends < p_max_sends and last_sent_at <= v_cooldown_cutoff)
      )
    returning sends into v_sends;
    if found then
      return json_build_object('allowed', true, 'sends', v_sends);
    end if;
    select sends, window_start, last_sent_at
      into v_sends, v_window_start, v_last_sent_at
    from otp_rate_limit where email = p_email;
  end if;

  if v_sends >= p_max_sends then
    v_retry := ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_sec) - v_now)))::int;
    return json_build_object('allowed', false, 'reason', 'rate-limited', 'retry_after_sec', greatest(v_retry, 1));
  end if;
  v_retry := ceil(extract(epoch from (v_last_sent_at + make_interval(secs => p_cooldown_sec) - v_now)))::int;
  return json_build_object('allowed', false, 'reason', 'cooldown', 'retry_after_sec', greatest(v_retry, 1));
end;
$$;

-- Best-effort slot refund after a hard (non-rate-limit) send failure.
create or replace function refund_otp_allowance(p_email text) returns void
language plpgsql security definer as $$
begin
  perform assert_service_role();
  update otp_rate_limit
  set
    sends = greatest(sends - 1, 0),
    last_sent_at = case when sends <= 1 then now() - interval '1 hour' else last_sent_at end
  where email = p_email;
end;
$$;

revoke execute on function consume_otp_allowance(text, integer, integer, integer) from public;
revoke execute on function refund_otp_allowance(text) from public;
grant execute on function consume_otp_allowance(text, integer, integer, integer) to service_role;
grant execute on function refund_otp_allowance(text) to service_role;

-- ───────────────────────────────────────────────────────
-- Avatars bucket (mirrors migrations/20250826000001_avatars_bucket.sql)
-- ───────────────────────────────────────────────────────
-- Profile photos: public bucket, 2MB, PNG/JPEG/WebP only (no SVG). Writes go
-- through the service-role avatar route (magic-byte sniffed); reads are open
-- by design — object paths are unguessable ({public_id}/{uuid}.{ext}).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ───────────────────────────────────────────────────────
-- No claims (mirrors migrations/20250824000004_no_claims.sql)
-- ───────────────────────────────────────────────────────
-- Cards are agnostic — no ownership. Drops the claims table if a previous
-- paste created it (its policies/grants vanish with the table).
drop table if exists claims;
