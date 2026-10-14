-- Preserve partial AI credit until the final percentage is rounded.
-- No historical grades are rewritten; recalculation uses existing grades.
CREATE OR REPLACE FUNCTION public.update_attempt_scores(p_attempt_id uuid)
RETURNS TABLE (attempt_id uuid, state text, score integer, correct_count integer, total_questions integer, cefr text, section_scores jsonb, completed_at timestamptz, finish_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_user_id text := auth.jwt() ->> 'sub';
  v_attempt public.attempts;
  v_correct integer;
  v_earned numeric;
  v_total integer;
  v_score integer;
  v_cefr text;
  v_sections jsonb;
BEGIN
  SELECT * INTO v_attempt FROM public.attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF coalesce(auth.role(), '') <> 'service_role' AND (v_user_id IS NULL OR v_attempt.user_id <> v_user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF v_attempt.state NOT IN ('submitted', 'timed_out') THEN RAISE EXCEPTION 'Attempt must be completed'; END IF;

  SELECT COUNT(q.id), COUNT(q.id) FILTER (WHERE q.answer_type = 'multiple_choice' AND aa.selected_index = k.correct_index), SUM(CASE
    WHEN q.answer_type = 'multiple_choice' THEN CASE WHEN aa.selected_index = k.correct_index THEN 1.0 ELSE 0.0 END
    WHEN q.answer_type = 'writing' THEN COALESCE(aa.writing_score, 0) / 100.0
    WHEN q.answer_type = 'speaking' THEN COALESCE(aa.speaking_score, 0) / 100.0
    ELSE 0.0 END)
  INTO v_total, v_correct, v_earned
  FROM public.exam_questions q
  LEFT JOIN private.exam_answer_keys k ON k.question_id = q.id
  LEFT JOIN public.attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = v_attempt.id
  WHERE q.exam_version_id = v_attempt.exam_version_id;

  v_score := COALESCE(ROUND((v_earned / NULLIF(v_total, 0)) * 100), 0);
  v_cefr := CASE WHEN v_score >= 80 THEN 'C1' WHEN v_score >= 60 THEN 'B2' WHEN v_score >= 40 THEN 'B1' ELSE 'A2' END;

  SELECT COALESCE(jsonb_object_agg(section, section_score), '{}'::jsonb) INTO v_sections FROM (
    SELECT q.section, ROUND(AVG(CASE
      WHEN q.answer_type = 'multiple_choice' THEN CASE WHEN aa.selected_index = k.correct_index THEN 100.0 ELSE 0.0 END
      WHEN q.answer_type = 'writing' THEN COALESCE(aa.writing_score, 0)::numeric
      WHEN q.answer_type = 'speaking' THEN COALESCE(aa.speaking_score, 0)::numeric
      ELSE 0 END)::numeric)::integer AS section_score
    FROM public.exam_questions q
    LEFT JOIN private.exam_answer_keys k ON k.question_id = q.id
    LEFT JOIN public.attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = v_attempt.id
    WHERE q.exam_version_id = v_attempt.exam_version_id GROUP BY q.section
  ) section_results;

  UPDATE public.attempts SET score=v_score, correct_count=v_correct, total_questions=v_total, cefr=v_cefr, section_scores=v_sections, updated_at=now() WHERE id=v_attempt.id RETURNING * INTO v_attempt;
  RETURN QUERY SELECT v_attempt.id, v_attempt.state, v_attempt.score, v_attempt.correct_count, v_attempt.total_questions, v_attempt.cefr, v_attempt.section_scores, v_attempt.completed_at, v_attempt.finish_reason;
END; $$;

REVOKE ALL ON FUNCTION public.update_attempt_scores(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_attempt_scores(uuid) TO authenticated, service_role;
