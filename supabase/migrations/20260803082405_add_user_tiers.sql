alter table public.profiles add column if not exists tier text not null default 'free';
alter table public.profiles add constraint profiles_tier_check check (tier in ('free', 'vip', 'vip_plus'));

alter table public.exam_packages add column if not exists min_tier text not null default 'vip';
alter table public.exam_packages add constraint exam_packages_min_tier_check check (min_tier in ('free', 'vip', 'vip_plus'));

update public.exam_packages
set min_tier = 'free'
where slug = 'hamza-test-full-1';

update public.exam_packages
set is_public = (min_tier = 'free')
where is_public is distinct from (min_tier = 'free');

create or replace function public.user_tier()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pr.tier from public.profiles pr where pr.id = (auth.jwt() ->> 'sub')),
    'free'
  );
$$;

create or replace function public.user_tier_rank()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case public.user_tier() when 'vip_plus' then 2 when 'vip' then 1 else 0 end;
$$;

create or replace function public.package_tier_rank(p_min_tier text)
returns integer
language sql
stable
set search_path = public
as $$
  select case coalesce(p_min_tier, 'vip') when 'vip_plus' then 2 when 'vip' then 1 else 0 end;
$$;

revoke all on function public.user_tier() from public, anon;
revoke all on function public.user_tier_rank() from public, anon;
revoke all on function public.package_tier_rank(text) from public, anon;

grant execute on function public.user_tier() to authenticated;
grant execute on function public.user_tier_rank() to authenticated;
grant execute on function public.package_tier_rank(text) to authenticated;

drop policy if exists "Participants can read accessible packages" on public.exam_packages;
drop policy if exists "Participants can read packages with a published version" on public.exam_packages;

create policy "Participants can read accessible packages"
  on public.exam_packages for select to authenticated
  using (
    public.is_admin() or (
      exists (
        select 1 from public.exam_versions ev
        where ev.package_id = exam_packages.id and ev.status = 'published'
      ) and (
        public.user_tier_rank() >= public.package_tier_rank(exam_packages.min_tier) or
        exists (
          select 1 from public.package_assignments pa
          where pa.package_id = exam_packages.id
            and (
              pa.user_id = (auth.jwt() ->> 'sub') or
              pa.user_id = lower(coalesce(auth.jwt() ->> 'email', auth.jwt() -> 'user_metadata' ->> 'email', ''))
            )
        )
      )
    )
  );

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
  v_attempt public.attempts;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  -- Check published version and package accessibility
  select ev.duration_minutes into v_duration_minutes
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

create or replace function public.admin_set_package_tier(
  p_package_id uuid,
  p_tier text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_free uuid;
begin
  if not public.is_admin() then
    raise exception 'Access denied: Admin role required';
  end if;

  if p_tier not in ('free', 'vip', 'vip_plus') then
    raise exception 'Tier tidak valid';
  end if;

  if p_tier = 'free' then
    select p.id into v_other_free
    from public.exam_packages p
    where p.min_tier = 'free'
      and p.id <> p_package_id
      and exists (
        select 1 from public.exam_versions ev
        where ev.package_id = p.id and ev.status = 'published'
      );

    if v_other_free is not null then
      raise exception 'Sudah ada paket free terbit; pilih tier lain untuk paket ini';
    end if;
  end if;

  update public.exam_packages
  set min_tier = p_tier,
      is_public = (p_tier = 'free'),
      updated_at = now()
  where id = p_package_id;

  if not found then
    raise exception 'Paket tidak ditemukan';
  end if;
end;
$$;

create or replace function public.admin_set_user_tier(
  p_user text,
  p_tier text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_tier not in ('free', 'vip', 'vip_plus') then
    raise exception 'Tier tidak valid';
  end if;

  update public.profiles
  set tier = p_tier,
      updated_at = now()
  where id = p_user;

  if not found then
    update public.profiles
    set tier = p_tier,
        updated_at = now()
    where lower(email) = lower(p_user);
  end if;

  if not found then
    raise exception 'Profil pengguna tidak ditemukan';
  end if;
end;
$$;

create or replace function public.get_admin_profiles()
returns table (
  id text,
  email text,
  display_name text,
  tier text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select pr.id, pr.email, pr.display_name, pr.tier, pr.created_at, pr.updated_at
  from public.profiles pr
  order by pr.updated_at desc;
end;
$$;

create or replace function public.get_my_profile()
returns table (
  id text,
  email text,
  display_name text,
  tier text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select pr.id, pr.email, pr.display_name, pr.tier
  from public.profiles pr
  where pr.id = (auth.jwt() ->> 'sub');
end;
$$;

revoke all on function public.admin_set_package_tier(uuid, text) from public, anon;
revoke all on function public.admin_set_user_tier(text, text) from public, anon;
revoke all on function public.get_admin_profiles() from public, anon;
revoke all on function public.get_my_profile() from public, anon;

grant execute on function public.admin_set_package_tier(uuid, text) to authenticated;
grant execute on function public.admin_set_user_tier(text, text) to authenticated;
grant execute on function public.get_admin_profiles() to authenticated;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.admin_import_exam_bundle(p_bundle jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_slug text;
  v_title text;
  v_subtitle text;
  v_duration integer;
  v_min_tier text;
  v_pkg_id uuid;
  v_ver_id uuid;
  v_q_item jsonb;
  v_q_count integer := 0;
  v_qid uuid;
  v_pos integer := 0;
  v_section text;
  v_question text;
  v_options jsonb;
  v_correct_index smallint;
  v_explanation text;
  v_passage text;
  v_audio_path text;
  v_answer_type text;
  v_prompt_hint text;
  v_min_words integer;
  v_prep_sec integer;
  v_max_rec_sec integer;
begin
  if not public.is_admin() then
    raise exception 'Access denied: Admin role required';
  end if;

  v_slug := coalesce(p_bundle->>'slug', p_bundle->>'id');
  if v_slug is null or trim(v_slug) = '' then
    raise exception 'Bundle slug/id is required';
  end if;

  v_title := coalesce(p_bundle->>'title', 'Paket Ujian');
  v_subtitle := coalesce(p_bundle->>'subtitle', 'Simulasi Ujian');
  v_duration := coalesce((p_bundle->>'durationMinutes')::integer, (p_bundle->>'duration_minutes')::integer, 60);
  v_min_tier := coalesce(p_bundle->>'min_tier', p_bundle->>'minTier', 'vip');

  if v_min_tier not in ('free', 'vip', 'vip_plus') then
    raise exception 'min_tier harus berupa free, vip, atau vip_plus';
  end if;

  if v_min_tier = 'free' then
    if exists (
      select 1
      from public.exam_packages p
      join public.exam_versions ev on ev.package_id = p.id
      where p.min_tier = 'free'
        and p.slug is distinct from v_slug
        and ev.status = 'published'
    ) then
      raise exception 'Sudah ada paket free terbit; pilih tier lain';
    end if;
  end if;

  -- Upsert package
  select id into v_pkg_id from public.exam_packages where slug = v_slug;
  if v_pkg_id is null then
    insert into public.exam_packages (slug, title, subtitle, is_public, min_tier)
    values (v_slug, v_title, v_subtitle, (v_min_tier = 'free'), v_min_tier)
    returning id into v_pkg_id;
  else
    update public.exam_packages
    set title = v_title,
        subtitle = v_subtitle,
        is_public = (v_min_tier = 'free'),
        min_tier = v_min_tier,
        updated_at = now()
    where id = v_pkg_id;
  end if;

  -- Upsert version 1
  select id into v_ver_id from public.exam_versions where package_id = v_pkg_id and version_number = 1;
  if v_ver_id is null then
    insert into public.exam_versions (package_id, version_number, duration_minutes, status, published_at)
    values (v_pkg_id, 1, v_duration, 'published', now())
    returning id into v_ver_id;
  else
    update public.exam_versions
    set duration_minutes = v_duration, status = 'published', published_at = coalesce(published_at, now())
    where id = v_ver_id;
  end if;

  -- Delete existing questions for this version to ensure full sync
  delete from public.exam_questions where exam_version_id = v_ver_id;

  -- Insert questions and answer keys
  for v_q_item in select * from jsonb_array_elements(p_bundle->'questions')
  loop
    v_pos := v_pos + 1;
    v_section := coalesce(v_q_item->>'section', 'reading');
    v_question := coalesce(v_q_item->>'question', '');
    v_options := v_q_item->'options';
    v_correct_index := coalesce((v_q_item->>'correct_index')::smallint, (v_q_item->>'correctIndex')::smallint, 0);
    v_explanation := coalesce(v_q_item->>'explanation', '');
    v_passage := v_q_item->>'passage';
    v_audio_path := coalesce(v_q_item->>'audio_path', v_q_item->>'audio_url', v_q_item->>'shared_asset_id');
    v_answer_type := coalesce(v_q_item->>'answer_type', v_q_item->>'answerType', 'multiple_choice');
    v_prompt_hint := v_q_item->>'prompt_hint';
    v_min_words := (v_q_item->>'minimum_words')::integer;
    v_prep_sec := (v_q_item->>'preparation_seconds')::integer;
    v_max_rec_sec := (v_q_item->>'max_recording_seconds')::integer;

    insert into public.exam_questions (
      exam_version_id, position, section, question, options, passage, audio_path,
      max_audio_plays, answer_type, prompt_hint, minimum_words, preparation_seconds, max_recording_seconds
    ) values (
      v_ver_id, v_pos, v_section, v_question, v_options, v_passage, v_audio_path,
      1, v_answer_type, v_prompt_hint, v_min_words, v_prep_sec, v_max_rec_sec
    ) returning id into v_qid;

    insert into private.exam_answer_keys (question_id, correct_index, explanation)
    values (v_qid, v_correct_index, v_explanation)
    on conflict (question_id) do update
    set correct_index = excluded.correct_index,
        explanation = excluded.explanation;

    v_q_count := v_q_count + 1;
  end loop;

  return jsonb_build_object(
    'package_id', v_pkg_id,
    'version_id', v_ver_id,
    'slug', v_slug,
    'question_count', v_q_count
  );
end;
$$;

revoke all on function public.admin_import_exam_bundle(jsonb) from public, anon;
grant execute on function public.admin_import_exam_bundle(jsonb) to authenticated;
