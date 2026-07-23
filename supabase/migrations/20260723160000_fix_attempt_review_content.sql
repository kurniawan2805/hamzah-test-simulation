-- Return the question type with completed-attempt review data.
-- The answer key and explanation remain private and are only exposed by this
-- function after the attempt has been submitted or timed out.
DROP FUNCTION IF EXISTS public.get_attempt_review(uuid);

CREATE OR REPLACE FUNCTION public.get_attempt_review(p_attempt_id uuid)
RETURNS TABLE (
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
  audio_storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id text := auth.jwt() ->> 'sub';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.attempts
    WHERE id = p_attempt_id
      AND user_id = v_user_id
      AND state IN ('submitted', 'timed_out')
  ) THEN
    RAISE EXCEPTION 'Completed attempt not found';
  END IF;

  RETURN QUERY
  SELECT q.id, q.position, q.section, q.question, q.options, q.passage,
    q.answer_type, aa.selected_index, k.correct_index, k.explanation,
    aa.answer_text, aa.writing_score, aa.writing_feedback, aa.audio_storage_path
  FROM public.exam_questions q
  JOIN public.attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = p_attempt_id
  LEFT JOIN private.exam_answer_keys k ON k.question_id = q.id
  ORDER BY q.position;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attempt_review(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_attempt_review(uuid) FROM public, anon;
