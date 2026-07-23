-- Migration to add support for writing section and AI grading
ALTER TABLE public.exam_questions DROP CONSTRAINT IF EXISTS exam_questions_section_check;
ALTER TABLE public.exam_questions ADD CONSTRAINT exam_questions_section_check 
  CHECK (section IN ('listening', 'reading', 'grammar', 'dictation', 'structures', 'writing', 'speaking'));

ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS answer_type text NOT NULL DEFAULT 'multiple_choice' 
  CHECK (answer_type IN ('multiple_choice', 'writing', 'speaking'));
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS prompt_hint text;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS minimum_words integer CHECK (minimum_words > 0);

ALTER TABLE public.exam_questions DROP CONSTRAINT IF EXISTS exam_questions_options_check;
ALTER TABLE public.exam_questions ADD CONSTRAINT exam_questions_options_check 
  CHECK (
    (answer_type = 'multiple_choice' AND jsonb_typeof(options) = 'array' AND jsonb_array_length(options) = 4)
    OR (answer_type IN ('writing', 'speaking'))
  );
ALTER TABLE public.exam_questions ALTER COLUMN options DROP NOT NULL;

ALTER TABLE public.attempt_answers ADD COLUMN IF NOT EXISTS answer_text text;
ALTER TABLE public.attempt_answers ADD COLUMN IF NOT EXISTS writing_score integer CHECK (writing_score BETWEEN 0 AND 100);
ALTER TABLE public.attempt_answers ADD COLUMN IF NOT EXISTS writing_feedback jsonb;

-- Drop old function to change signature
DROP FUNCTION IF EXISTS public.save_attempt_answer(uuid, uuid, smallint, boolean, boolean);

CREATE OR REPLACE FUNCTION public.save_attempt_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_index smallint,
  p_bookmarked boolean,
  p_mark_viewed boolean DEFAULT true,
  p_answer_text text DEFAULT null
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

GRANT EXECUTE ON FUNCTION public.save_attempt_answer(uuid, uuid, smallint, boolean, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.save_attempt_answer(uuid, uuid, smallint, boolean, boolean, text) FROM public, anon;

-- Function to recalculate and update attempt scores (used post-AI evaluation)
CREATE OR REPLACE FUNCTION public.update_attempt_scores(p_attempt_id uuid)
RETURNS TABLE (
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id text := auth.jwt() ->> 'sub';
  v_attempt public.attempts;
  v_correct_count integer;
  v_total_questions integer;
  v_score integer;
  v_cefr text;
  v_section_scores jsonb;
BEGIN
  -- Authenticated user check can be bypassed if called internally or by service_role,
  -- but we verify ownership if v_user_id is present.
  SELECT * INTO v_attempt
  FROM public.attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;

  IF v_user_id IS NOT NULL AND v_attempt.user_id <> v_user_id THEN
    -- Allow service_role to run this even without jwt user
    IF auth.role() <> 'service_role' THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  -- Calculate scores
  -- MCQ questions count as 1 point if correct.
  -- Writing questions count as (writing_score / 100.0) points.
  SELECT
    COUNT(q.id),
    ROUND(SUM(
      CASE 
        WHEN q.answer_type = 'multiple_choice' THEN 
          CASE WHEN aa.selected_index = k.correct_index THEN 1.0 ELSE 0.0 END
        ELSE COALESCE(aa.writing_score, 0) / 100.0
      END
    ))
  INTO v_total_questions, v_correct_count
  FROM public.exam_questions q
  LEFT JOIN private.exam_answer_keys k ON k.question_id = q.id
  LEFT JOIN public.attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = v_attempt.id
  WHERE q.exam_version_id = v_attempt.exam_version_id;

  v_score := ROUND((v_correct_count::numeric / NULLIF(v_total_questions, 0)) * 100);
  v_cefr := CASE
    WHEN v_score >= 80 THEN 'C1'
    WHEN v_score >= 60 THEN 'B2'
    WHEN v_score >= 40 THEN 'B1'
    ELSE 'A2'
  END;

  -- Calculate section scores
  SELECT COALESCE(jsonb_object_agg(section, section_score), '{}'::jsonb)
  INTO v_section_scores
  FROM (
    SELECT q.section,
      ROUND(AVG(
        CASE 
          WHEN q.answer_type = 'multiple_choice' THEN 
            CASE WHEN aa.selected_index = k.correct_index THEN 100.0 ELSE 0.0 END
          ELSE COALESCE(aa.writing_score, 0)::numeric
        END
      ))::integer AS section_score
    FROM public.exam_questions q
    LEFT JOIN private.exam_answer_keys k ON k.question_id = q.id
    LEFT JOIN public.attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = v_attempt.id
    WHERE q.exam_version_id = v_attempt.exam_version_id
    GROUP BY q.section
  ) section_results;

  UPDATE public.attempts
  SET score = v_score,
      correct_count = v_correct_count,
      total_questions = v_total_questions,
      cefr = v_cefr,
      section_scores = v_section_scores,
      updated_at = now()
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  RETURN QUERY SELECT v_attempt.id, v_attempt.state, v_attempt.score, v_attempt.correct_count,
    v_attempt.total_questions, v_attempt.cefr, v_attempt.section_scores, v_attempt.completed_at, v_attempt.finish_reason;
END;
$$;

-- Update finish_attempt to use the new update_attempt_scores scoring function
CREATE OR REPLACE FUNCTION public.finish_attempt(p_attempt_id uuid)
RETURNS TABLE (
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id text := auth.jwt() ->> 'sub';
  v_attempt public.attempts;
  v_reason text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT * INTO v_attempt
  FROM public.attempts
  WHERE id = p_attempt_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;

  IF v_attempt.state <> 'active' then
    RETURN QUERY SELECT v_attempt.id, v_attempt.state, v_attempt.score, v_attempt.correct_count,
      v_attempt.total_questions, v_attempt.cefr, v_attempt.section_scores, v_attempt.completed_at, v_attempt.finish_reason;
    RETURN;
  END IF;

  v_reason := CASE WHEN now() >= v_attempt.ends_at THEN 'timeout' ELSE 'manual' END;

  UPDATE public.attempts
  SET state = CASE WHEN v_reason = 'timeout' THEN 'timed_out' ELSE 'submitted' END,
      completed_at = now(),
      finish_reason = v_reason,
      updated_at = now()
  WHERE id = v_attempt.id;

  RETURN QUERY SELECT * FROM public.update_attempt_scores(p_attempt_id);
END;
$$;

-- Create save_writing_grades function for service_role/AI calls
CREATE OR REPLACE FUNCTION public.save_writing_grades(
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

REVOKE ALL ON FUNCTION public.save_writing_grades(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_writing_grades(uuid, jsonb) TO service_role;
