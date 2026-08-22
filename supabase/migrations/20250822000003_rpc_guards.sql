-- Guard writer RPCs against anon/authenticated callers.
-- Hosted Supabase grants EXECUTE on public functions to anon/authenticated
-- (platform-managed privileges that override plain REVOKE), so function-level
-- grants are not enough: the functions must reject non-service roles themselves.
create or replace function assert_service_role() returns void
language plpgsql stable as $$
begin
  -- PostgREST sets the role: 'anon' for publishable keys, 'service_role' for
  -- secret keys. 'none' = direct admin connection (psql/migrations).
  if coalesce(current_setting('role', true), '') not in ('service_role', 'postgres', 'none') then
    raise exception 'forbidden: service role required';
  end if;
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

-- Ranking helper: rank of every active listing
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
