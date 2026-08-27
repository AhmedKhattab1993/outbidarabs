-- Meta fetch jobs (Pattern B: preview answers from the DB, a background
-- job enriches Instagram through the unblocking proxy — one source, no
-- fallback stacks). See docs/meta-enrichment.md.
--
-- meta_cache becomes the state machine:
--   fetch_status 'pending' — a job holds the lease (next_attempt_at = lease end)
--   fetch_status 'ok'      — has data; fetched_at drives the 7-day freshness
--   fetch_status 'failed'  — last run failed; next_attempt_at = backoff end
-- attempts = consecutive claims since the last success (reset on success);
-- after MAX attempts the row cools down (1h) before a new claim session.

alter table meta_cache add column if not exists fetch_status text not null default 'ok';
alter table meta_cache add column if not exists attempts integer not null default 0;
alter table meta_cache add column if not exists next_attempt_at timestamptz not null default now();

-- Enforce the state vocabulary on existing + future rows (added after the
-- default so backfills below never violate it).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'meta_cache_fetch_status_check') then
    alter table meta_cache add constraint meta_cache_fetch_status_check
      check (fetch_status in ('pending', 'ok', 'failed'));
  end if;
end $$;

-- Legacy rows are only ever written on success, but stay safe: a row
-- without any data can't claim to be ok.
update meta_cache set fetch_status = 'failed'
 where coalesce(title, '') = '' and coalesce(description, '') = '' and coalesce(image_url, '') = '';

-- Atomic claim — concurrent requests / lambdas never double-fetch the same
-- profile. Service role only (mirrors assert_service_role house style).
--   → {action:'serve', status} when nothing should run (fresh ok, live
--     lease, backoff window, or exhausted attempts inside the cooldown)
--   → {action:'run', attempts} when the caller now owns the lease and must
--     run the job, then finish_meta_fetch it.
create or replace function claim_meta_fetch(
  p_url text,
  p_platform text,
  p_lease_sec integer,
  p_max_attempts integer,
  p_force boolean default false
) returns json
language plpgsql security definer as $$
declare
  v_row meta_cache%ROWTYPE;
  v_now timestamptz := now();
begin
  perform assert_service_role();
  select * into v_row from meta_cache where url = p_url for update;

  if v_row.url is not null then
    -- A live lease is never stomped, forced or not.
    if v_row.fetch_status = 'pending' and v_row.next_attempt_at > v_now then
      return json_build_object('action', 'serve', 'status', 'pending');
    end if;
    if not p_force then
      -- Fresh success: nothing to do.
      if v_row.fetch_status = 'ok' and v_row.fetched_at > v_now - interval '7 days' then
        return json_build_object('action', 'serve', 'status', 'ok');
      end if;
      -- Failure backoff window: retrying now would only hammer upstream.
      if v_row.fetch_status = 'failed' and v_row.next_attempt_at > v_now then
        return json_build_object('action', 'serve', 'status', 'failed');
      end if;
    end if;
    -- Attempts exhausted for this session: give up until the cooldown
    -- (next_attempt_at = cooldown end, set by the last failure) passes.
    if v_row.attempts >= p_max_attempts and v_row.next_attempt_at > v_now then
      return json_build_object('action', 'serve', 'status', v_row.fetch_status);
    end if;
  end if;

  insert into meta_cache (url, platform, fetch_status, attempts, next_attempt_at)
  values (p_url, p_platform, 'pending', 1, v_now + make_interval(secs => p_lease_sec))
  on conflict (url) do update set
    platform = excluded.platform,
    fetch_status = 'pending',
    attempts = case
      -- A new session after the cooldown starts fresh.
      when meta_cache.attempts >= p_max_attempts and meta_cache.next_attempt_at <= v_now
        then 1
      else meta_cache.attempts + 1
    end,
    next_attempt_at = excluded.next_attempt_at
  returning * into v_row;

  return json_build_object('action', 'run', 'attempts', v_row.attempts);
end;
$$;

-- Terminal write of one enrichment run: success stores the data (and resets
-- attempts/freshness); failure schedules the next backoff.
create or replace function finish_meta_fetch(
  p_url text,
  p_ok boolean,
  p_title text,
  p_description text,
  p_image text,
  p_retry_after_sec integer default 5
) returns void
language plpgsql security definer as $$
begin
  perform assert_service_role();
  if p_ok then
    update meta_cache set
      title = p_title,
      description = p_description,
      image_url = p_image,
      fetch_status = 'ok',
      attempts = 0,
      next_attempt_at = now(),
      fetched_at = now()
    where url = p_url;
  else
    update meta_cache set
      fetch_status = 'failed',
      next_attempt_at = now() + make_interval(secs => greatest(p_retry_after_sec, 1))
    where url = p_url;
  end if;
end;
$$;

revoke execute on function claim_meta_fetch(text, text, integer, integer, boolean) from public;
revoke execute on function finish_meta_fetch(text, boolean, text, text, text, integer) from public;
grant execute on function claim_meta_fetch(text, text, integer, integer, boolean) to service_role;
grant execute on function finish_meta_fetch(text, boolean, text, text, text, integer) to service_role;

-- ── Listing-meta bucket: platform avatars uploaded by the enrichment job ──
-- (IG CDN URLs are signed and expire within days; objects here are served
-- forever. Unguessable path = sha256 of the canonical URL.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-meta', 'listing-meta', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
