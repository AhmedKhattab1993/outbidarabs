-- outbidsarabs.lol — Supabase schema
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
create or replace function listing_rank(target uuid) returns integer
language sql stable as $$
  select count(*) + 1
  from listings l
  where l.is_active
    and l.id <> target
    and (l.bid_amount, l.last_bid_at) > (
      select (x.bid_amount, x.last_bid_at) from listings x where x.id = target
    );
$$;

-- Increment clicks + revenue atomically
create or replace function register_click(p_listing uuid) returns void
language sql security definer as $$
  update listings set clicks = clicks + 1 where id = p_listing;
  insert into clicks (listing_id) values (p_listing);
$$;

-- Increment a site_stats counter, returns the new value
create or replace function bump_stat(key text) returns bigint
language plpgsql security definer as $$
declare
  new_value bigint;
begin
  insert into site_stats (key, value) values (key, 1)
  on conflict (key) do update set value = site_stats.value + 1
  returning value into new_value;
  return new_value;
end;
$$;

-- ── RLS ───────────────────────────────────────────────────
alter table listings enable row level security;
alter table clicks enable row level security;
alter table activity enable row level security;
alter table site_stats enable row level security;

-- Public read
create policy "public read listings" on listings for select using (true);
create policy "public read clicks" on clicks for select using (true);
create policy "public read activity" on activity for select using (true);
create policy "public read stats" on site_stats for select using (true);
-- No public write — all writes go through the service role (webhooks / API).
