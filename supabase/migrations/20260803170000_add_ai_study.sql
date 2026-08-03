alter table public.exam_questions add column if not exists topic text;

create table if not exists public.ai_study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  topic text not null,
  section text not null check (section in ('grammar', 'structures')),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_study_sessions_one_active_per_user_topic
  on public.ai_study_sessions (user_id, topic)
  where status = 'active';

create table if not exists public.ai_study_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_study_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) > 0 and char_length(content) <= 6000),
  created_at timestamptz not null default now()
);

create index if not exists ai_study_messages_session_idx
  on public.ai_study_messages (session_id, created_at);

create table if not exists public.ai_study_quizzes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_study_sessions(id) on delete cascade,
  topic text not null,
  question_count integer not null default 5 check (question_count between 1 and 5),
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  score integer check (score between 0 and 100),
  correct_count integer check (correct_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_study_quizzes_session_idx
  on public.ai_study_quizzes (session_id);

create table if not exists private.ai_study_quiz_keys (
  quiz_id uuid primary key references public.ai_study_quizzes(id) on delete cascade,
  keys jsonb not null
);

create table if not exists public.ai_study_usage (
  user_id text not null,
  usage_date date not null default current_date,
  messages_used integer not null default 0 check (messages_used >= 0),
  quizzes_used integer not null default 0 check (quizzes_used >= 0),
  primary key (user_id, usage_date)
);

alter table public.ai_study_sessions enable row level security;
alter table public.ai_study_messages enable row level security;
alter table public.ai_study_quizzes enable row level security;
alter table public.ai_study_usage enable row level security;
alter table private.ai_study_quiz_keys enable row level security;

revoke insert, update, delete on public.ai_study_sessions, public.ai_study_messages,
  public.ai_study_quizzes, public.ai_study_usage from anon, authenticated;
grant select on public.ai_study_sessions, public.ai_study_messages, public.ai_study_quizzes,
  public.ai_study_usage to authenticated;

revoke all on private.ai_study_quiz_keys from public, anon, authenticated;

create policy "Users read their own AI study sessions"
  on public.ai_study_sessions for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users read messages in their own sessions"
  on public.ai_study_messages for select to authenticated
  using (
    exists (
      select 1 from public.ai_study_sessions s
      where s.id = ai_study_messages.session_id
        and s.user_id = (select auth.jwt() ->> 'sub')
    )
  );

create policy "Users read quizzes in their own sessions"
  on public.ai_study_quizzes for select to authenticated
  using (
    exists (
      select 1 from public.ai_study_sessions s
      where s.id = ai_study_quizzes.session_id
        and s.user_id = (select auth.jwt() ->> 'sub')
    )
  );

create policy "Users read their own AI study usage"
  on public.ai_study_usage for select to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

create or replace function public.ai_study_is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.user_tier() = 'vip_plus';
$$;

revoke all on function public.ai_study_is_allowed() from public, anon;
grant execute on function public.ai_study_is_allowed() to authenticated;

create or replace function public.ai_study_start_session(p_topic text, p_section text)
returns table (
  session_id uuid,
  topic text,
  section text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_session public.ai_study_sessions;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if not public.ai_study_is_allowed() then
    raise exception 'Akses ditolak: fitur khusus VIP+';
  end if;
  if p_section not in ('grammar', 'structures') then
    raise exception 'Seksi topik tidak valid';
  end if;
  if length(trim(p_topic)) = 0 then
    raise exception 'Topik wajib diisi';
  end if;

  select * into v_session
  from public.ai_study_sessions
  where user_id = v_user_id
    and topic = p_topic
    and status = 'active'
  limit 1;

  if not found then
    insert into public.ai_study_sessions (user_id, topic, section)
    values (v_user_id, p_topic, p_section)
    on conflict (user_id, topic) where status = 'active' do nothing
    returning * into v_session;

    if not found then
      select * into v_session
      from public.ai_study_sessions
      where user_id = v_user_id
        and topic = p_topic
        and status = 'active'
      limit 1;
    end if;
  end if;

  return query select v_session.id, v_session.topic, v_session.section, v_session.created_at;
end;
$$;

revoke all on function public.ai_study_start_session(text, text) from public, anon;
grant execute on function public.ai_study_start_session(text, text) to authenticated;

create or replace function public.ai_study_append_message(
  p_session_id uuid,
  p_role text,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_session public.ai_study_sessions;
  v_messages_used integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if not public.ai_study_is_allowed() then
    raise exception 'Akses ditolak: fitur khusus VIP+';
  end if;
  if p_role not in ('user', 'assistant') then
    raise exception 'Peran pesan tidak valid';
  end if;
  if length(trim(p_content)) = 0 or length(p_content) > 6000 then
    raise exception 'Isi pesan tidak valid';
  end if;

  select * into v_session
  from public.ai_study_sessions
  where id = p_session_id and user_id = v_user_id;

  if not found then
    raise exception 'Sesi belajar tidak ditemukan';
  end if;

  if p_role = 'assistant' then
    insert into public.ai_study_usage (user_id, usage_date)
    values (v_user_id, current_date)
    on conflict (user_id, usage_date) do nothing;

    select messages_used into v_messages_used
    from public.ai_study_usage
    where user_id = v_user_id and usage_date = current_date
    for update;

    if v_messages_used >= 30 then
      raise exception 'Kuota pesan harian habis (30 pesan/hari)';
    end if;

    update public.ai_study_usage
    set messages_used = v_messages_used + 1
    where user_id = v_user_id and usage_date = current_date;
  end if;

  insert into public.ai_study_messages (session_id, role, content)
  values (p_session_id, p_role, p_content);
end;
$$;

revoke all on function public.ai_study_append_message(uuid, text, text) from public, anon;
grant execute on function public.ai_study_append_message(uuid, text, text) to authenticated;

create or replace function public.ai_study_begin_quiz(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_session public.ai_study_sessions;
  v_quizzes_used integer;
  v_quiz_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if not public.ai_study_is_allowed() then
    raise exception 'Akses ditolak: fitur khusus VIP+';
  end if;

  select * into v_session
  from public.ai_study_sessions
  where id = p_session_id and user_id = v_user_id;

  if not found then
    raise exception 'Sesi belajar tidak ditemukan';
  end if;

  insert into public.ai_study_usage (user_id, usage_date)
  values (v_user_id, current_date)
  on conflict (user_id, usage_date) do nothing;

  select quizzes_used into v_quizzes_used
  from public.ai_study_usage
  where user_id = v_user_id and usage_date = current_date
  for update;

  if v_quizzes_used >= 10 then
    raise exception 'Kuota kuis harian habis (10 kuis/hari)';
  end if;

  update public.ai_study_usage
  set quizzes_used = v_quizzes_used + 1
  where user_id = v_user_id and usage_date = current_date;

  insert into public.ai_study_quizzes (session_id, topic)
  values (p_session_id, v_session.topic)
  returning id into v_quiz_id;

  return v_quiz_id;
end;
$$;

revoke all on function public.ai_study_begin_quiz(uuid) from public, anon;
grant execute on function public.ai_study_begin_quiz(uuid) to authenticated;

create or replace function public.ai_study_pick_questions(p_topic text, p_limit integer default 5)
returns table (
  question_id uuid,
  section text,
  question text,
  options jsonb,
  passage text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_user_email text := lower(coalesce(auth.jwt() ->> 'email', auth.jwt() -> 'user_metadata' ->> 'email', ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 5));
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if not public.ai_study_is_allowed() then
    raise exception 'Akses ditolak: fitur khusus VIP+';
  end if;

  return query
  select q.id, q.section, q.question, q.options, q.passage
  from public.exam_questions q
  join public.exam_versions ev on ev.id = q.exam_version_id
  join public.exam_packages p on p.id = ev.package_id
  where q.topic = p_topic
    and coalesce(q.answer_type, 'multiple_choice') = 'multiple_choice'
    and ev.status = 'published'
    and (
      public.is_admin()
      or public.user_tier_rank() >= public.package_tier_rank(p.min_tier)
      or exists (
        select 1 from public.package_assignments pa
        where pa.package_id = p.id
          and (pa.user_id = v_user_id or (v_user_email <> '' and pa.user_id = v_user_email))
      )
    )
  order by q.position
  limit v_limit;
end;
$$;

revoke all on function public.ai_study_pick_questions(text, integer) from public, anon;
grant execute on function public.ai_study_pick_questions(text, integer) to authenticated;

create or replace function public.ai_study_grade_quiz(
  p_quiz_id uuid,
  p_answers integer[]
)
returns table (
  score integer,
  correct_count integer,
  questions jsonb
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_quiz public.ai_study_quizzes;
  v_keys jsonb;
  v_question jsonb;
  v_key jsonb;
  v_index integer;
  v_selected integer;
  v_correct integer;
  v_explanation text;
  v_correct_count integer := 0;
  v_question_count integer;
  v_result jsonb := '[]'::jsonb;
  v_key_row private.exam_answer_keys%rowtype;
  v_answer_key_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if not public.ai_study_is_allowed() then
    raise exception 'Akses ditolak: fitur khusus VIP+';
  end if;

  select q.* into v_quiz
  from public.ai_study_quizzes q
  join public.ai_study_sessions s on s.id = q.session_id
  where q.id = p_quiz_id and s.user_id = v_user_id;

  if not found then
    raise exception 'Kuis tidak ditemukan';
  end if;

  select keys into v_keys from private.ai_study_quiz_keys where quiz_id = p_quiz_id;
  v_question_count := jsonb_array_length(v_quiz.questions);

  for v_index in 0..(v_question_count - 1) loop
    v_question := v_quiz.questions -> v_index;
    v_key := v_keys -> v_index;
    v_selected := -1;
    if v_index < cardinality(p_answers) and p_answers[v_index + 1] is not null then
      v_selected := p_answers[v_index + 1];
    end if;

    v_answer_key_id := (v_key ->> 'question_id')::uuid;
    if v_answer_key_id is not null then
      select correct_index, explanation into v_correct, v_explanation
      from private.exam_answer_keys
      where question_id = v_answer_key_id;
    else
      v_correct := (v_key ->> 'correct_index')::integer;
      v_explanation := v_key ->> 'explanation';
    end if;

    if v_selected = v_correct then
      v_correct_count := v_correct_count + 1;
    end if;

    v_result := v_result || jsonb_build_object(
      'index', v_index,
      'question', v_question ->> 'question',
      'options', v_question -> 'options',
      'passage', v_question -> 'passage',
      'selected_index', v_selected,
      'correct_index', v_correct,
      'explanation', v_explanation,
      'is_correct', v_selected = v_correct
    );
  end loop;

  update public.ai_study_quizzes
  set answers = to_jsonb(p_answers),
      score = round(100.0 * v_correct_count / nullif(v_question_count, 0))::integer,
      correct_count = v_correct_count,
      completed_at = coalesce(completed_at, now())
  where id = p_quiz_id;

  return query
  select round(100.0 * v_correct_count / nullif(v_question_count, 0))::integer,
         v_correct_count,
         v_result;
end;
$$;

revoke all on function public.ai_study_grade_quiz(uuid, integer[]) from public, anon;
grant execute on function public.ai_study_grade_quiz(uuid, integer[]) to authenticated;

create or replace function public.ai_study_save_quiz_answers(p_quiz_id uuid, p_answers integer[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_quiz public.ai_study_quizzes;
  v_answer integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if not public.ai_study_is_allowed() then
    raise exception 'Akses ditolak: fitur khusus VIP+';
  end if;

  select q.* into v_quiz
  from public.ai_study_quizzes q
  join public.ai_study_sessions s on s.id = q.session_id
  where q.id = p_quiz_id and s.user_id = v_user_id;

  if not found then
    raise exception 'Kuis tidak ditemukan';
  end if;
  if v_quiz.completed_at is not null then
    raise exception 'Kuis sudah dinilai';
  end if;
  if cardinality(p_answers) > jsonb_array_length(v_quiz.questions) then
    raise exception 'Jumlah jawaban melebihi jumlah soal';
  end if;

  foreach v_answer in array p_answers loop
    if v_answer is not null and (v_answer < 0 or v_answer > 3) then
      raise exception 'Jawaban tidak valid';
    end if;
  end loop;

  update public.ai_study_quizzes
  set answers = to_jsonb(p_answers)
  where id = p_quiz_id;
end;
$$;

revoke all on function public.ai_study_save_quiz_answers(uuid, integer[]) from public, anon;
grant execute on function public.ai_study_save_quiz_answers(uuid, integer[]) to authenticated;

create or replace function public.ai_study_usage_remaining()
returns table (
  messages_remaining integer,
  quizzes_remaining integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    greatest(0, 30 - coalesce(u.messages_used, 0)),
    greatest(0, 10 - coalesce(u.quizzes_used, 0))
  from (select auth.jwt() ->> 'sub' as user_id) caller
  left join public.ai_study_usage u
    on u.user_id = caller.user_id and u.usage_date = current_date;
$$;

revoke all on function public.ai_study_usage_remaining() from public, anon;
grant execute on function public.ai_study_usage_remaining() to authenticated;
