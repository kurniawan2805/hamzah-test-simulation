create extension if not exists pgcrypto;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table public.exam_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  subtitle text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exam_versions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.exam_packages(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  duration_minutes integer not null check (duration_minutes between 1 and 300),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (package_id, version_number)
);

create unique index exam_versions_one_published_per_package
  on public.exam_versions (package_id)
  where status = 'published';

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_version_id uuid not null references public.exam_versions(id) on delete restrict,
  position integer not null check (position > 0),
  section text not null check (section in ('listening', 'reading', 'grammar', 'dictation')),
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  passage text,
  audio_path text,
  max_audio_plays smallint not null default 2 check (max_audio_plays between 1 and 5),
  created_at timestamptz not null default now(),
  unique (exam_version_id, position)
);

create table private.exam_answer_keys (
  question_id uuid primary key references public.exam_questions(id) on delete cascade,
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text not null
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  exam_version_id uuid not null references public.exam_versions(id) on delete restrict,
  state text not null default 'active' check (state in ('active', 'submitted', 'timed_out')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  completed_at timestamptz,
  finish_reason text check (finish_reason in ('manual', 'timeout')),
  score integer check (score between 0 and 100),
  correct_count integer check (correct_count >= 0),
  total_questions integer check (total_questions > 0),
  cefr text check (cefr in ('A2', 'B1', 'B2', 'C1')),
  section_scores jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index attempts_one_active_per_user_version
  on public.attempts (user_id, exam_version_id)
  where state = 'active';

create index attempts_user_finished_at_idx on public.attempts (user_id, completed_at desc);

create table public.attempt_answers (
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.exam_questions(id) on delete restrict,
  selected_index smallint check (selected_index between 0 and 3),
  bookmarked boolean not null default false,
  viewed_at timestamptz,
  audio_play_count smallint not null default 0 check (audio_play_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create index attempt_answers_attempt_idx on public.attempt_answers (attempt_id);

alter table public.exam_packages enable row level security;
alter table public.exam_versions enable row level security;
alter table public.exam_questions enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;

create policy "Participants can read packages with a published version"
  on public.exam_packages for select to authenticated
  using (
    exists (
      select 1 from public.exam_versions ev
      where ev.package_id = exam_packages.id and ev.status = 'published'
    )
  );

create policy "Participants can read published exam versions"
  on public.exam_versions for select to authenticated
  using (status = 'published');

create policy "Participants can read published questions"
  on public.exam_questions for select to authenticated
  using (
    exists (
      select 1 from public.exam_versions ev
      where ev.id = exam_questions.exam_version_id and ev.status = 'published'
    )
  );

create policy "Participants can read their attempts"
  on public.attempts for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Participants can read their attempt answers"
  on public.attempt_answers for select to authenticated
  using (
    exists (
      select 1 from public.attempts a
      where a.id = attempt_answers.attempt_id
        and a.user_id = (select auth.jwt() ->> 'sub')
    )
  );

revoke insert, update, delete on public.exam_packages, public.exam_versions, public.exam_questions, public.attempts, public.attempt_answers from anon, authenticated;
grant select on public.exam_packages, public.exam_versions, public.exam_questions, public.attempts, public.attempt_answers to authenticated;

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
  v_duration_minutes integer;
  v_attempt public.attempts;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select duration_minutes into v_duration_minutes
  from public.exam_versions
  where id = p_exam_version_id and status = 'published';

  if v_duration_minutes is null then
    raise exception 'Published exam version not found';
  end if;

  select * into v_attempt
  from public.attempts a
  where a.user_id = v_user_id
    and a.exam_version_id = p_exam_version_id
    and a.state = 'active'
  for update;

  if found and v_attempt.ends_at > now() then
    return query select v_attempt.id, v_attempt.exam_version_id, v_attempt.started_at, v_attempt.ends_at, v_attempt.state;
    return;
  end if;

  if found then
    perform public.finish_attempt(v_attempt.id);
  end if;

  insert into public.attempts (user_id, exam_version_id, ends_at)
  values (v_user_id, p_exam_version_id, now() + make_interval(mins => v_duration_minutes))
  returning * into v_attempt;

  insert into public.attempt_answers (attempt_id, question_id)
  select v_attempt.id, q.id
  from public.exam_questions q
  where q.exam_version_id = p_exam_version_id;

  return query select v_attempt.id, v_attempt.exam_version_id, v_attempt.started_at, v_attempt.ends_at, v_attempt.state;
end;
$$;

create or replace function public.save_attempt_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_index smallint,
  p_bookmarked boolean,
  p_mark_viewed boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  update public.attempt_answers aa
  set selected_index = p_selected_index,
      bookmarked = p_bookmarked,
      viewed_at = case when p_mark_viewed then coalesce(aa.viewed_at, now()) else aa.viewed_at end,
      updated_at = now()
  from public.attempts a
  where aa.attempt_id = p_attempt_id
    and aa.question_id = p_question_id
    and a.id = aa.attempt_id
    and a.user_id = v_user_id
    and a.state = 'active'
    and a.ends_at > now();

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    perform public.finish_attempt(p_attempt_id);
    raise exception 'Attempt is no longer editable';
  end if;
end;
$$;

create or replace function public.record_audio_play(p_attempt_id uuid, p_question_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_remaining smallint;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  update public.attempt_answers aa
  set audio_play_count = aa.audio_play_count + 1,
      viewed_at = coalesce(aa.viewed_at, now()),
      updated_at = now()
  from public.attempts a, public.exam_questions q
  where aa.attempt_id = p_attempt_id
    and aa.question_id = p_question_id
    and a.id = aa.attempt_id
    and a.user_id = v_user_id
    and a.state = 'active'
    and a.ends_at > now()
    and q.audio_path is not null
    and aa.audio_play_count < q.max_audio_plays
  returning (q.max_audio_plays - aa.audio_play_count)::smallint into v_remaining;

  if v_remaining is null then
    perform public.finish_attempt(p_attempt_id);
    raise exception 'Audio is unavailable or its playback quota has been used';
  end if;

  return v_remaining;
end;
$$;

create or replace function public.finish_attempt(p_attempt_id uuid)
returns table (
  attempt_id uuid,
  state text,
  score integer,
  correct_count integer,
  total_questions integer,
  cefr text,
  section_scores jsonb,
  completed_at timestamptz,
  finish_reason text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_attempt public.attempts;
  v_correct_count integer;
  v_total_questions integer;
  v_score integer;
  v_cefr text;
  v_section_scores jsonb;
  v_reason text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select * into v_attempt
  from public.attempts
  where id = p_attempt_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Attempt not found';
  end if;

  if v_attempt.state <> 'active' then
    return query select v_attempt.id, v_attempt.state, v_attempt.score, v_attempt.correct_count,
      v_attempt.total_questions, v_attempt.cefr, v_attempt.section_scores, v_attempt.completed_at, v_attempt.finish_reason;
    return;
  end if;

  select
    count(k.question_id),
    count(k.question_id) filter (where aa.selected_index = k.correct_index)
  into v_total_questions, v_correct_count
  from private.exam_answer_keys k
  join public.exam_questions q on q.id = k.question_id
  left join public.attempt_answers aa on aa.question_id = q.id and aa.attempt_id = v_attempt.id
  where q.exam_version_id = v_attempt.exam_version_id;

  v_score := round((v_correct_count::numeric / nullif(v_total_questions, 0)) * 100);
  v_cefr := case
    when v_score >= 80 then 'C1'
    when v_score >= 60 then 'B2'
    when v_score >= 40 then 'B1'
    else 'A2'
  end;

  select coalesce(jsonb_object_agg(section, section_score), '{}'::jsonb)
  into v_section_scores
  from (
    select q.section,
      round((count(*) filter (where aa.selected_index = k.correct_index)::numeric / nullif(count(*), 0)) * 100)::integer as section_score
    from public.exam_questions q
    join private.exam_answer_keys k on k.question_id = q.id
    left join public.attempt_answers aa on aa.question_id = q.id and aa.attempt_id = v_attempt.id
    where q.exam_version_id = v_attempt.exam_version_id
    group by q.section
  ) section_results;

  v_reason := case when now() >= v_attempt.ends_at then 'timeout' else 'manual' end;

  update public.attempts
  set state = case when v_reason = 'timeout' then 'timed_out' else 'submitted' end,
      completed_at = now(),
      finish_reason = v_reason,
      score = v_score,
      correct_count = v_correct_count,
      total_questions = v_total_questions,
      cefr = v_cefr,
      section_scores = v_section_scores,
      updated_at = now()
  where id = v_attempt.id
  returning * into v_attempt;

  return query select v_attempt.id, v_attempt.state, v_attempt.score, v_attempt.correct_count,
    v_attempt.total_questions, v_attempt.cefr, v_attempt.section_scores, v_attempt.completed_at, v_attempt.finish_reason;
end;
$$;

create or replace function public.get_attempt_review(p_attempt_id uuid)
returns table (
  question_id uuid,
  position integer,
  section text,
  question text,
  options jsonb,
  passage text,
  selected_index smallint,
  correct_index smallint,
  explanation text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
begin
  if not exists (
    select 1 from public.attempts
    where id = p_attempt_id
      and user_id = v_user_id
      and state in ('submitted', 'timed_out')
  ) then
    raise exception 'Completed attempt not found';
  end if;

  return query
  select q.id, q.position, q.section, q.question, q.options, q.passage,
    aa.selected_index, k.correct_index, k.explanation
  from public.exam_questions q
  join public.attempt_answers aa on aa.question_id = q.id and aa.attempt_id = p_attempt_id
  join private.exam_answer_keys k on k.question_id = q.id
  order by q.position;
end;
$$;

insert into storage.buckets (id, name, public)
values ('exam-audio', 'exam-audio', false)
on conflict (id) do nothing;

create policy "Active participants can create signed audio URLs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'exam-audio'
    and exists (
      select 1 from public.attempts a
      where a.user_id = (select auth.jwt() ->> 'sub')
        and a.state = 'active'
        and a.ends_at > now()
    )
  );

revoke all on function public.start_attempt(uuid) from public, anon;
revoke all on function public.save_attempt_answer(uuid, uuid, smallint, boolean, boolean) from public, anon;
revoke all on function public.record_audio_play(uuid, uuid) from public, anon;
revoke all on function public.finish_attempt(uuid) from public, anon;
revoke all on function public.get_attempt_review(uuid) from public, anon;
grant execute on function public.start_attempt(uuid) to authenticated;
grant execute on function public.save_attempt_answer(uuid, uuid, smallint, boolean, boolean) to authenticated;
grant execute on function public.record_audio_play(uuid, uuid) to authenticated;
grant execute on function public.finish_attempt(uuid) to authenticated;
grant execute on function public.get_attempt_review(uuid) to authenticated;
