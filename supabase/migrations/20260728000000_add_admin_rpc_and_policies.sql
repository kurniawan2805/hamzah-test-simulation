create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (auth.jwt() ->> 'role') = 'admin' or
    (auth.jwt() -> 'public_metadata' ->> 'role') = 'admin' or
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$$;

create policy "Admin can read all attempts"
  on public.attempts for select to authenticated
  using (public.is_admin());

create policy "Admin can read all attempt answers"
  on public.attempt_answers for select to authenticated
  using (public.is_admin());

create policy "Admin can manage exam packages"
  on public.exam_packages for all to authenticated
  using (public.is_admin());

create policy "Admin can manage exam versions"
  on public.exam_versions for all to authenticated
  using (public.is_admin());

create policy "Admin can manage exam questions"
  on public.exam_questions for all to authenticated
  using (public.is_admin());

create or replace function public.get_admin_all_attempts()
returns table (
  id uuid,
  user_id text,
  exam_version_id uuid,
  exam_title text,
  state text,
  started_at timestamptz,
  ends_at timestamptz,
  completed_at timestamptz,
  score integer,
  correct_count integer,
  total_questions integer,
  cefr text,
  section_scores jsonb,
  finish_reason text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied: Admin role required';
  end if;

  return query
  select a.id, a.user_id, a.exam_version_id, coalesce(p.title, 'Simulasi Ujian') as exam_title,
         a.state, a.started_at, a.ends_at, a.completed_at,
         a.score, a.correct_count, a.total_questions, a.cefr,
         a.section_scores, a.finish_reason
  from public.attempts a
  join public.exam_versions v on v.id = a.exam_version_id
  join public.exam_packages p on p.id = v.package_id
  order by a.created_at desc;
end;
$$;

create or replace function public.get_admin_attempt_review(p_attempt_id uuid)
returns table (
  question_id uuid,
  position integer,
  section text,
  question text,
  options jsonb,
  passage text,
  answer_type text,
  selected_index smallint,
  correct_index smallint,
  explanation text,
  answer_text text,
  writing_score integer,
  writing_feedback jsonb,
  speaking_score integer,
  speaking_feedback jsonb,
  audio_storage_path text
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied: Admin role required';
  end if;

  return query
  select q.id, q.position, q.section, q.question, q.options, q.passage,
         q.answer_type, aa.selected_index, k.correct_index, k.explanation,
         aa.answer_text, aa.writing_score, aa.writing_feedback,
         aa.speaking_score, aa.speaking_feedback, aa.audio_storage_path
  from public.exam_questions q
  join public.attempt_answers aa on aa.question_id = q.id and aa.attempt_id = p_attempt_id
  join private.exam_answer_keys k on k.question_id = q.id
  order by q.position;
end;
$$;

create or replace function public.admin_upsert_question(
  p_question_id uuid default null,
  p_exam_version_id uuid default null,
  p_position integer default 1,
  p_section text default 'reading',
  p_question text default '',
  p_options jsonb default '["","","",""]'::jsonb,
  p_correct_index smallint default 0,
  p_explanation text default '',
  p_passage text default null,
  p_audio_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_qid uuid := p_question_id;
begin
  if not public.is_admin() then
    raise exception 'Access denied: Admin role required';
  end if;

  if v_qid is null then
    insert into public.exam_questions (
      exam_version_id, position, section, question, options, passage, audio_path
    ) values (
      p_exam_version_id, p_position, p_section, p_question, p_options, p_passage, p_audio_path
    ) returning id into v_qid;

    insert into private.exam_answer_keys (question_id, correct_index, explanation)
    values (v_qid, p_correct_index, p_explanation);
  else
    update public.exam_questions
    set position = p_position,
        section = p_section,
        question = p_question,
        options = p_options,
        passage = p_passage,
        audio_path = p_audio_path
    where id = v_qid;

    insert into private.exam_answer_keys (question_id, correct_index, explanation)
    values (v_qid, p_correct_index, p_explanation)
    on conflict (question_id) do update
    set correct_index = excluded.correct_index,
        explanation = excluded.explanation;
  end if;

  return v_qid;
end;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.get_admin_all_attempts() from public, anon;
revoke all on function public.get_admin_attempt_review(uuid) from public, anon;
revoke all on function public.admin_upsert_question(uuid, uuid, integer, text, text, jsonb, smallint, text, text, text) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.get_admin_all_attempts() to authenticated;
grant execute on function public.get_admin_attempt_review(uuid) to authenticated;
grant execute on function public.admin_upsert_question(uuid, uuid, integer, text, text, jsonb, smallint, text, text, text) to authenticated;
