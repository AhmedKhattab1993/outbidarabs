-- Lockdown (review follow-ups on the accounts feature):
--  · profiles/claims → service-role only. Both carry auth uuids
--    (profiles.id = auth.users.id, claims.user_id) and the anon key is
--    public (NEXT_PUBLIC_), so the "public read" policies exposed the
--    uuid↔public_id mapping and every card owner's auth id. The app reads
--    these tables exclusively through the service role (src/lib/accounts.ts
--    — verified by grep), and public surfaces use the opaque public_id, so
--    the policies and grants go. The profiles self-insert/self-update
--    policies are dropped too: no authenticated-direct path exists
--    (ensureProfile/updateProfile run as service role). supporters_view
--    keeps working — views execute with the view owner's privileges.
--    RLS stays enabled with no policies: belt and braces with the revokes,
--    matching how payments is locked down.
--    (The schema's blanket default-privilege grant covers FUTURE tables
--    only — there are no table-specific default grants to undo here.)
drop policy if exists "profiles public or self read" on profiles;
drop policy if exists "profiles self insert" on profiles;
drop policy if exists "profiles self update" on profiles;
drop policy if exists "public read claims" on claims;
revoke select on profiles from anon, authenticated;
revoke select on claims from anon, authenticated;

--  · consume_otp_allowance — atomic OTP window/cooldown/increment. The old
--    read→check→upsert in the app let two concurrent sends both read
--    sends=0 (upserts don't conflict) and undercount; the whole decision
--    now runs in one server-side UPDATE (expired-window reset included).
--    Returns json: {"allowed":true,"sends":N} or
--    {"allowed":false,"reason":"rate-limited"|"cooldown","retry_after_sec":N}.
--    Params come from the app constants (single source of truth).
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

  -- Atomic consume: one UPDATE gates on (window expired → reset) OR
  -- (under cap AND cooldown passed). Column references in SET see the OLD
  -- row, so the expired-window reset (sends = 1, window_start = now) and
  -- the plain increment cannot interleave.
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

  -- Zero rows: fresh email (no row) or limited (row exists, gate failed).
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
    -- Lost the insert race: the row exists now — retry the consume once.
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

  -- Limited: which gate failed decides the reason; retry = until that gate
  -- clears (window end for the cap, last send + cooldown for resends).
  if v_sends >= p_max_sends then
    v_retry := ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_sec) - v_now)))::int;
    return json_build_object('allowed', false, 'reason', 'rate-limited', 'retry_after_sec', greatest(v_retry, 1));
  end if;
  v_retry := ceil(extract(epoch from (v_last_sent_at + make_interval(secs => p_cooldown_sec) - v_now)))::int;
  return json_build_object('allowed', false, 'reason', 'cooldown', 'retry_after_sec', greatest(v_retry, 1));
end;
$$;

--  · refund_otp_allowance — best-effort refund of a consumed slot after a
--    hard (non-rate-limit) send failure, so transient Supabase outages
--    don't burn the 5/hour cap. When the failed send was the only one in
--    the window, the cooldown timestamp is pushed back too (a refunded
--    send must not gate the retry).
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
