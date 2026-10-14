alter table public.ai_study_quizzes add column if not exists review jsonb;

create table private.ai_study_message_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_study_sessions(id) on delete cascade,
  user_id text not null,
  usage_date date not null default current_date,
  completed_at timestamptz
);
alter table private.ai_study_message_requests enable row level security;
revoke all on private.ai_study_message_requests from public, anon, authenticated;

create function public.ai_study_open_session(p_topic text, p_section text)
returns table (session_id uuid, topic text, section text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_user text := auth.jwt()->>'sub'; v_session public.ai_study_sessions;
begin
  if v_user is null or not public.ai_study_is_allowed() then raise exception 'Akses ditolak'; end if;
  if not ((p_section = 'grammar' and p_topic in ('grammar_huruf_jar','grammar_fiil_madhi_mudhari','grammar_mubtada_khabar'))
    or (p_section = 'structures' and p_topic in ('structures_kaana','structures_isim_majrur'))) then
    raise exception 'Topik tidak valid';
  end if;
  insert into public.ai_study_sessions(user_id,topic,section) values(v_user,p_topic,p_section)
    on conflict do nothing;
  select s.* into strict v_session from public.ai_study_sessions s
    where s.user_id=v_user and s.topic=p_topic and s.status='active';
  return query select v_session.id,v_session.topic,v_session.section,v_session.created_at;
end; $$;

create function public.ai_study_session_context(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session public.ai_study_sessions;
begin
  if auth.jwt()->>'sub' is null or not public.ai_study_is_allowed() then raise exception 'Akses ditolak'; end if;
  select s.* into v_session from public.ai_study_sessions s
    where s.id=p_session_id and s.user_id=auth.jwt()->>'sub' and s.status='active';
  if not found then raise exception 'Sesi belajar tidak ditemukan'; end if;
  return jsonb_build_object('topic',v_session.topic,'section',v_session.section);
end; $$;

create function public.ai_study_reserve_message(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_context jsonb; v_user text := auth.jwt()->>'sub'; v_request uuid;
begin
  v_context := public.ai_study_session_context(p_session_id);
  insert into public.ai_study_usage(user_id,usage_date) values(v_user,current_date) on conflict do nothing;
  update public.ai_study_usage set messages_used=messages_used+1
    where user_id=v_user and usage_date=current_date and messages_used<30;
  if not found then raise exception 'Kuota pesan harian habis (30 pesan/hari)'; end if;
  insert into private.ai_study_message_requests(session_id,user_id) values(p_session_id,v_user) returning id into v_request;
  return v_context || jsonb_build_object('request_id',v_request);
end; $$;

create function public.ai_study_complete_message(p_request_id uuid,p_content text,p_user_message text default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare v_request private.ai_study_message_requests;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Access denied'; end if;
  if p_content is null or length(trim(p_content))=0 or length(p_content)>6000
    or (p_user_message is not null and (length(trim(p_user_message))=0 or length(p_user_message)>4000)) then raise exception 'Isi pesan tidak valid'; end if;
  select r.* into v_request from private.ai_study_message_requests r where r.id=p_request_id for update;
  if not found then raise exception 'Request tidak ditemukan'; end if;
  if v_request.completed_at is not null then raise exception 'Request sudah selesai'; end if;
  if p_user_message is not null then
    insert into public.ai_study_messages(session_id,role,content) values(v_request.session_id,'user',p_user_message);
  end if;
  insert into public.ai_study_messages(session_id,role,content,created_at) values(v_request.session_id,'assistant',p_content,clock_timestamp());
  update private.ai_study_message_requests set completed_at=now() where id=p_request_id;
end; $$;

create function public.ai_study_publish_quiz(p_quiz_id uuid,p_questions jsonb,p_keys jsonb)
returns void language plpgsql security definer set search_path = public, private as $$
declare v_quiz public.ai_study_quizzes; i integer; v_question jsonb; v_key jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Access denied'; end if;
  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_typeof(p_keys) is distinct from 'array' then raise exception 'Format kuis tidak valid'; end if;
  if jsonb_array_length(p_questions)<>5 or jsonb_array_length(p_keys)<>5 then raise exception 'Kuis harus berisi 5 soal dan kunci'; end if;
  select q.* into v_quiz from public.ai_study_quizzes q where q.id=p_quiz_id for update;
  if not found or v_quiz.completed_at is not null or jsonb_array_length(v_quiz.questions)>0 then raise exception 'Kuis tidak dapat diterbitkan'; end if;
  for i in 0..4 loop
    v_question := p_questions->i; v_key := p_keys->i;
    if jsonb_typeof(v_question) is distinct from 'object' or coalesce(length(trim(v_question->>'question')),0)=0
      or v_question ?| array['correct_index','explanation','keys'] then raise exception 'Soal tidak valid'; end if;
    if jsonb_typeof(v_question->'options') is distinct from 'array' then raise exception 'Opsi tidak valid'; end if;
    if jsonb_array_length(v_question->'options')<>4 or exists(select 1 from jsonb_array_elements(v_question->'options') o where jsonb_typeof(o)<>'string' or length(trim(o#>>'{}'))=0) then raise exception 'Opsi tidak valid'; end if;
    if v_key->>'question_id' is not null then
      if not exists(select 1 from public.exam_questions q join private.exam_answer_keys k on k.question_id=q.id where q.id=(v_key->>'question_id')::uuid and q.topic=v_quiz.topic and q.answer_type='multiple_choice') then raise exception 'Kunci bank tidak valid'; end if;
    elsif jsonb_typeof(v_key->'correct_index') is distinct from 'number' or coalesce(v_key->>'correct_index','') !~ '^[0-3]$'
      or coalesce(length(trim(v_key->>'explanation')),0)=0 then raise exception 'Kunci generate tidak valid'; end if;
  end loop;
  insert into private.ai_study_quiz_keys(quiz_id,keys) values(p_quiz_id,p_keys);
  update public.ai_study_quizzes set questions=p_questions,question_count=5 where id=p_quiz_id;
end; $$;

create function public.ai_study_submit_quiz(p_quiz_id uuid,p_answers integer[])
returns table(score integer,correct_count integer,questions jsonb)
language plpgsql security definer set search_path = public, private as $$
declare
  v_quiz public.ai_study_quizzes; v_keys jsonb; v_result jsonb := '[]';
  v_answers integer[]; v_correct integer; v_explanation text; v_selected integer;
  v_count integer := 0; i integer; v_score integer;
begin
  if auth.jwt()->>'sub' is null or not public.ai_study_is_allowed() then raise exception 'Akses ditolak'; end if;
  select q.* into v_quiz from public.ai_study_quizzes q join public.ai_study_sessions s on s.id=q.session_id
    where q.id=p_quiz_id and s.user_id=auth.jwt()->>'sub' for update of q;
  if not found then raise exception 'Kuis tidak ditemukan'; end if;
  if v_quiz.review is not null then
    return query select v_quiz.score,v_quiz.correct_count,v_quiz.review; return;
  end if;
  if jsonb_array_length(v_quiz.questions)<>5 then raise exception 'Kuis belum siap'; end if;
  select k.keys into v_keys from private.ai_study_quiz_keys k where k.quiz_id=p_quiz_id;
  if not found or jsonb_array_length(v_keys)<>5 then raise exception 'Kunci kuis tidak tersedia'; end if;
  if v_quiz.completed_at is not null then
    select array_agg(value::integer order by ordinality) into v_answers from jsonb_array_elements_text(v_quiz.answers) with ordinality;
  else v_answers := p_answers;
  end if;
  if v_answers is null or cardinality(v_answers)>5 then raise exception 'Jawaban tidak valid'; end if;
  if exists(select 1 from unnest(v_answers) a where a is not null and (a<0 or a>3)) then raise exception 'Jawaban tidak valid'; end if;
  for i in 0..4 loop
    v_selected := v_answers[i+1]; v_correct := null; v_explanation := null;
    if v_keys->i->>'question_id' is not null then
      select k.correct_index,k.explanation into v_correct,v_explanation from private.exam_answer_keys k where k.question_id=(v_keys->i->>'question_id')::uuid;
    else v_correct := (v_keys->i->>'correct_index')::integer; v_explanation := v_keys->i->>'explanation'; end if;
    if v_correct is null then raise exception 'Kunci kuis tidak valid'; end if;
    if v_selected=v_correct then v_count:=v_count+1; end if;
    v_result := v_result || jsonb_build_object('index',i,'question',v_quiz.questions->i->>'question','options',v_quiz.questions->i->'options',
      'passage',v_quiz.questions->i->'passage','selected_index',v_selected,'correct_index',v_correct,'explanation',v_explanation,'is_correct',coalesce(v_selected=v_correct,false));
  end loop;
  v_score := round(100.0*v_count/5)::integer;
  update public.ai_study_quizzes q set answers=to_jsonb(v_answers),score=v_score,correct_count=v_count,review=v_result,completed_at=coalesce(q.completed_at,now()) where q.id=p_quiz_id;
  return query select v_score,v_count,v_result;
end; $$;

create function public.ai_study_get_quiz_result(p_quiz_id uuid)
returns table(score integer,correct_count integer,questions jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.ai_study_quizzes q join public.ai_study_sessions s on s.id=q.session_id
    where q.id=p_quiz_id and s.user_id=auth.jwt()->>'sub' and q.completed_at is not null) then raise exception 'Hasil kuis tidak ditemukan'; end if;
  return query select * from public.ai_study_submit_quiz(p_quiz_id,'{}'::integer[]);
end; $$;

do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('ai_study_append_message','ai_study_grade_quiz') loop
    execute format('revoke all on function %s from public, anon, authenticated',f);
  end loop;
end; $$;

revoke all on function public.ai_study_open_session(text,text),public.ai_study_session_context(uuid),public.ai_study_reserve_message(uuid),
  public.ai_study_submit_quiz(uuid,integer[]),public.ai_study_get_quiz_result(uuid) from public,anon;
grant execute on function public.ai_study_open_session(text,text),public.ai_study_session_context(uuid),public.ai_study_reserve_message(uuid),
  public.ai_study_submit_quiz(uuid,integer[]),public.ai_study_get_quiz_result(uuid) to authenticated;
revoke all on function public.ai_study_complete_message(uuid,text,text),public.ai_study_publish_quiz(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ai_study_complete_message(uuid,text,text),public.ai_study_publish_quiz(uuid,jsonb,jsonb) to service_role;
