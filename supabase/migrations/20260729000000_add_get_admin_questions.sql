create or replace function public.get_admin_questions(p_exam_version_id uuid)
returns table (
  id uuid,
  position integer,
  section text,
  question text,
  options jsonb,
  passage text,
  audio_path text,
  correct_index smallint,
  explanation text
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
  select q.id, q.position, q.section, q.question, q.options, q.passage, q.audio_path,
         coalesce(k.correct_index, 0::smallint) as correct_index,
         coalesce(k.explanation, '') as explanation
  from public.exam_questions q
  left join private.exam_answer_keys k on k.question_id = q.id
  where q.exam_version_id = p_exam_version_id
  order by q.position;
end;
$$;

revoke all on function public.get_admin_questions(uuid) from public, anon;
grant execute on function public.get_admin_questions(uuid) to authenticated;
