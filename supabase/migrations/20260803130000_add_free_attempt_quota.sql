create or replace function public.free_attempts_remaining(p_exam_version_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() or public.user_tier() <> 'free' then -1
    else greatest(0, 2 - (
      select count(*)::integer
      from public.attempts as a
      join public.exam_versions as v on v.id = a.exam_version_id
      where a.user_id = (auth.jwt() ->> 'sub')
        and v.package_id = (
          select ev.package_id
          from public.exam_versions as ev
          where ev.id = p_exam_version_id
        )
        and a.state in ('submitted', 'timed_out')
    ))
  end;
$$;

revoke all on function public.free_attempts_remaining(uuid) from public, anon;
grant execute on function public.free_attempts_remaining(uuid) to authenticated;

create or replace function public.start_attempt(p_exam_version_id uuid)
returns table (
  attempt_id uuid,
  exam_version_id uuid,
  started_at timestamptz,
  ends_at timestamptz,
  state text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_user_email text := lower(coalesce(auth.jwt() ->> 'email', auth.jwt() -> 'user_metadata' ->> 'email', ''));
  v_duration_minutes integer;
  v_package_id uuid;
  v_attempt public.attempts;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  -- Check published version and package accessibility
  select ev.duration_minutes, p.id into v_duration_minutes, v_package_id
  from public.exam_versions as ev
  join public.exam_packages as p on p.id = ev.package_id
  where ev.id = p_exam_version_id
    and ev.status = 'published'
    and (
      public.user_tier_rank() >= public.package_tier_rank(p.min_tier) or
      public.is_admin() or
      exists (
        select 1 from public.package_assignments pa
        where pa.package_id = p.id
          and (pa.user_id = v_user_id or (v_user_email <> '' and pa.user_id = v_user_email))
      )
    );

  if v_duration_minutes is null then
    raise exception 'Published exam version not found or package access denied';
  end if;

  -- Serialize start/resume per user + package so kuota and active-attempt checks stay atomic
  perform pg_advisory_xact_lock(hashtext(v_user_id || ':' || v_package_id)::bigint);

  select a.* into v_attempt
  from public.attempts as a
  where a.user_id = v_user_id
    and a.exam_version_id = p_exam_version_id
    and a.state = 'active'
  for update;

  if found and v_attempt.ends_at > now() then
    return query select v_attempt.id, v_attempt.exam_version_id,
      v_attempt.started_at, v_attempt.ends_at, v_attempt.state;
    return;
  end if;

  if found then
    perform public.finish_attempt(v_attempt.id);
  end if;

  if public.user_tier() = 'free' and not public.is_admin()
     and public.free_attempts_remaining(p_exam_version_id) <= 0 then
    raise exception 'Kuota percobaan gratis untuk paket ini sudah habis (maksimal 2 kali).';
  end if;

  insert into public.attempts (user_id, exam_version_id, ends_at)
  values (v_user_id, p_exam_version_id,
    now() + make_interval(mins => v_duration_minutes))
  returning * into v_attempt;

  insert into public.attempt_answers (attempt_id, question_id)
  select v_attempt.id, q.id
  from public.exam_questions as q
  where q.exam_version_id = p_exam_version_id;

  return query select v_attempt.id, v_attempt.exam_version_id,
    v_attempt.started_at, v_attempt.ends_at, v_attempt.state;
end;
$$;

revoke all on function public.start_attempt(uuid) from public, anon;
grant execute on function public.start_attempt(uuid) to authenticated;
