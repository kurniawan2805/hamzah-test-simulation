-- Alter default max_audio_plays to 1
alter table public.exam_questions alter column max_audio_plays set default 1;

-- Update existing questions to have max_audio_plays = 1
update public.exam_questions set max_audio_plays = 1;

-- Replace record_audio_play to handle shared audio tracks (grouped by audio_path)
create or replace function public.record_audio_play(p_attempt_id uuid, p_question_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_audio_path text;
  v_max_plays smallint;
  v_current_plays smallint;
  v_remaining smallint;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  -- Get audio path and max plays for target question
  select q.audio_path, q.max_audio_plays into v_audio_path, v_max_plays
  from public.exam_questions q
  where q.id = p_question_id;

  if v_audio_path is null then
    raise exception 'Question does not have an audio track';
  end if;

  -- Check if attempt is active
  if not exists (
    select 1 from public.attempts
    where id = p_attempt_id and user_id = v_user_id and state = 'active' and ends_at > now()
  ) then
    raise exception 'Attempt is not active';
  end if;

  -- Get the current maximum play count among all questions sharing this audio_path in this attempt
  select coalesce(max(aa.audio_play_count), 0) into v_current_plays
  from public.attempt_answers aa
  join public.exam_questions q on q.id = aa.question_id
  where aa.attempt_id = p_attempt_id and q.audio_path = v_audio_path;

  -- If already exhausted, raise exception
  if v_current_plays >= v_max_plays then
    perform public.finish_attempt(p_attempt_id);
    raise exception 'Audio is unavailable or its playback quota has been used';
  end if;

  -- Increment for all questions sharing the same audio_path in this attempt
  update public.attempt_answers aa
  set audio_play_count = aa.audio_play_count + 1,
      viewed_at = coalesce(aa.viewed_at, now()),
      updated_at = now()
  from public.exam_questions q
  where aa.attempt_id = p_attempt_id
    and aa.question_id = q.id
    and q.audio_path = v_audio_path;

  -- Return remaining plays for the target question
  select (q.max_audio_plays - aa.audio_play_count)::smallint into v_remaining
  from public.attempt_answers aa
  join public.exam_questions q on q.id = aa.question_id
  where aa.attempt_id = p_attempt_id and aa.question_id = p_question_id;

  return v_remaining;
end;
$$;

revoke all on function public.record_audio_play(uuid, uuid) from public, anon;
grant execute on function public.record_audio_play(uuid, uuid) to authenticated;
