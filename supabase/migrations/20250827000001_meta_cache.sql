-- ───────────────────────────────────────────────────────
-- Meta cache
-- ───────────────────────────────────────────────────────
-- Durable last-known-good platform metadata for the preview card
-- (src/lib/fetch-meta.ts). One row per canonical identity URL; written
-- server-side on every successful fetch, read before any upstream trip.
-- Instagram throttles/blocks server IPs aggressively, so anything fetched
-- successfully even once must serve instantly forever — this table is what
-- makes that possible across lambda restarts (the in-memory maps die with
-- each instance).
create table if not exists meta_cache (
  url text primary key,             -- canonical identity URL (listings.url space)
  platform text not null,
  title text,
  description text,
  image_url text,
  fetched_at timestamptz not null default now()
);
