-- outbidarabs.lol — Supabase schema
create extension if not exists "pgcrypto";

-- ── Listings ──────────────────────────────────────────────
create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  url text not null,                    -- clean url or @handle
  display_name text not null,           -- domain or @handle shown
  description text,                     -- optional Arabic/English
  bid_amount integer not null check (bid_amount between 5 and 999999),
  clicks integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_bid_at timestamptz not null default now(),
  polar_order_id text,
  is_active boolean not null default true,
  unique (url)
);
alter table listings add column if not exists target_url text;  -- click-through href
alter table listings add column if not exists image_url text;   -- og:image

-- Equal bids: older bid keeps the higher rank → order by bid_amount desc, last_bid_at asc
create index if not exists listings_rank_idx on listings (is_active, bid_amount desc, last_bid_at asc);
create index if not exists listings_last_bid_idx on listings (last_bid_at desc);

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
