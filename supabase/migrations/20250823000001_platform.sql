-- Platform-focused board: every listing belongs to a platform
-- (instagram | tiktok | x | linkedin | website | app).

alter table listings
  add column if not exists platform text not null default 'website';

-- Backfill platform from the canonical url for existing rows.
update listings set platform = case
  when url like 'https://instagram.com/%' then 'instagram'
  when url like 'https://tiktok.com/%' then 'tiktok'
  when url like 'https://x.com/%' or url like 'https://twitter.com/%' then 'x'
  when url like 'https://linkedin.com/%' then 'linkedin'
  when url like 'https://apps.apple.com/%'
    or url like 'https://play.google.com/%' then 'app'
  else 'website'
end;

create index if not exists listings_platform_idx
  on listings (platform, is_active, bid_amount desc);

-- Keep the platform value valid at the DB level for future writes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'listings_platform_check'
  ) then
    alter table listings add constraint listings_platform_check
      check (platform in ('instagram', 'tiktok', 'x', 'linkedin', 'website', 'app'));
  end if;
end $$;
