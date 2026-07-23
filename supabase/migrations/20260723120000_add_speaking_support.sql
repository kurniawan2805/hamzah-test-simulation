-- Migration to add support for speaking section, audio uploads, and AI grading

-- Add max_recording_seconds to exam_questions
ALTER TABLE public.exam_questions 
  ADD COLUMN IF NOT EXISTS max_recording_seconds integer DEFAULT 60 
  CHECK (max_recording_seconds BETWEEN 10 AND 300);

-- Add audio_storage_path to attempt_answers to save recorded speaking answers
ALTER TABLE public.attempt_answers 
  ADD COLUMN IF NOT EXISTS audio_storage_path text;

-- Drop old save_attempt_answer to replace with new signature supporting audio_storage_path
DROP FUNCTION IF EXISTS public.save_attempt_answer(uuid, uuid, smallint, boolean, boolean, text);

CREATE OR REPLACE FUNCTION public.save_attempt_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_index smallint,
  p_bookmarked boolean,
  p_mark_viewed boolean DEFAULT true,
  p_answer_text text DEFAULT null,
  p_audio_storage_path text DEFAULT null
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text := auth.jwt() ->> 'sub';
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  UPDATE public.attempt_answers aa
  SET selected_index = p_selected_index,
      bookmarked = p_bookmarked,
      answer_text = p_answer_text,
      audio_storage_path = COALESCE(p_audio_storage_path, aa.audio_storage_path),
      viewed_at = CASE WHEN p_mark_viewed THEN COALESCE(aa.viewed_at, now()) ELSE aa.viewed_at END,
      updated_at = now()
  FROM public.attempts a
  WHERE aa.attempt_id = p_attempt_id
    AND aa.question_id = p_question_id
    AND a.id = aa.attempt_id
    AND a.user_id = v_user_id
    AND a.state = 'active'
    AND a.ends_at > now();

  GET DIAGNOSTICS v_updated = row_count;
  IF v_updated = 0 THEN
    PERFORM public.finish_attempt(p_attempt_id);
    RAISE EXCEPTION 'Attempt is no longer editable';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_attempt_answer(uuid, uuid, smallint, boolean, boolean, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.save_attempt_answer(uuid, uuid, smallint, boolean, boolean, text, text) FROM public, anon;

-- Function to save AI speaking grades (service_role only)
CREATE OR REPLACE FUNCTION public.save_speaking_grades(
  p_attempt_id uuid,
  p_grades jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_item jsonb;
BEGIN
  -- Restrict execution to service_role only
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_grades)
  LOOP
    UPDATE public.attempt_answers
    SET writing_score = (v_item->>'score')::integer,
        writing_feedback = v_item->'feedback',
        updated_at = now()
    WHERE attempt_id = p_attempt_id
      AND question_id = (v_item->>'question_id')::uuid;
  END LOOP;

  -- Recalculate attempt final scores
  PERFORM public.update_attempt_scores(p_attempt_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_speaking_grades(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_speaking_grades(uuid, jsonb) TO service_role;

-- Storage Policy: allow authenticated users to insert speaking files into their own active attempts
-- (Assumes public.attempts has user_id, active state and validation checks)
CREATE POLICY "Users can upload speaking audio to their active attempts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'exam-audio'
  AND (storage.foldername(name))[1] = 'speaking'
  AND EXISTS (
    SELECT 1 FROM public.attempts
    WHERE id = ((storage.foldername(name))[2])::uuid
      AND user_id = (auth.jwt()->>'sub')
      AND state = 'active'
      AND ends_at > now()
  )
);

-- Drop old get_attempt_review to update return signature
DROP FUNCTION IF EXISTS public.get_attempt_review(uuid);

CREATE OR REPLACE FUNCTION public.get_attempt_review(p_attempt_id uuid)
RETURNS TABLE (
  question_id uuid,
  position integer,
  section text,
  question text,
  options jsonb,
  passage text,
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
    aa.selected_index, k.correct_index, k.explanation,
    aa.answer_text, aa.writing_score, aa.writing_feedback, aa.audio_storage_path
  FROM public.exam_questions q
  JOIN public.attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = p_attempt_id
  LEFT JOIN private.exam_answer_keys k ON k.question_id = q.id
  ORDER BY q.position;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attempt_review(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_attempt_review(uuid) FROM public, anon;
