-- Realtime: broadcast board + activity changes to every visitor
-- (idempotent — the guarded block also lives in the init migration; this
-- migration is kept for already-migrated databases)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'listings') then
    alter publication supabase_realtime add table listings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'activity') then
    alter publication supabase_realtime add table activity;
  end if;
end $$;
