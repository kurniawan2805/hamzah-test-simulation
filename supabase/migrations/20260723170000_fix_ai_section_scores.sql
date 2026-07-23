-- Keep speaking grades separate from writing grades. The previous speaking RPC
-- wrote into writing_score, which made the two AI sections overwrite each other
-- and made score recalculation depend on which function finished last.
ALTER TABLE public.attempt_answers
  ADD COLUMN IF NOT EXISTS speaking_score integer CHECK (speaking_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS speaking_feedback jsonb;

-- Preserve grades already written by the buggy RPC.
UPDATE public.attempt_answers aa
SET speaking_score = aa.writing_score,
    speaking_feedback = aa.writing_feedback,
    writing_score = NULL,
    writing_feedback = NULL
FROM public.exam_questions q
WHERE q.id = aa.question_id
  AND q.answer_type = 'speaking'
  AND aa.speaking_score IS NULL
  AND aa.writing_score IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_attempt_scores(p_attempt_id uuid)
RETURNS TABLE (attempt_id uuid, state text, score integer, correct_count integer, total_questions integer, cefr text, section_scores jsonb, completed_at timestamptz, finish_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_user_id text := auth.jwt() ->> 'sub';
  v_attempt public.attempts;
  v_correct integer;
  v_total integer;
  v_score integer;
  v_cefr text;
  v_sections jsonb;
BEGIN
  SELECT * INTO v_attempt FROM public.attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF v_user_id IS NOT NULL AND v_attempt.user_id <> v_user_id AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT COUNT(q.id), ROUND(SUM(CASE
    WHEN q.answer_type = 'multiple_choice' THEN CASE WHEN aa.selected_index = k.correct_index THEN 1.0 ELSE 0.0 END
    WHEN q.answer_type = 'writing' THEN COALESCE(aa.writing_score, 0) / 100.0
    WHEN q.answer_type = 'speaking' THEN COALESCE(aa.speaking_score, 0) / 100.0
    ELSE 0.0 END))
  INTO v_total, v_correct
  FROM public.exam_questions q
  LEFT JOIN private.exam_answer_keys k ON k.question_id = q.id
  LEFT JOIN public.attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = v_attempt.id
  WHERE q.exam_version_id = v_attempt.exam_version_id;

  v_score := COALESCE(ROUND((v_correct::numeric / NULLIF(v_total, 0)) * 100), 0);
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

CREATE OR REPLACE FUNCTION public.save_speaking_grades(p_attempt_id uuid, p_grades jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_item jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Access denied'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_grades) LOOP
    UPDATE public.attempt_answers SET speaking_score=(v_item->>'score')::integer, speaking_feedback=v_item->'feedback', updated_at=now()
    WHERE attempt_id=p_attempt_id AND question_id=(v_item->>'question_id')::uuid;
  END LOOP;
  PERFORM public.update_attempt_scores(p_attempt_id);
END; $$;
REVOKE ALL ON FUNCTION public.save_speaking_grades(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_speaking_grades(uuid, jsonb) TO service_role;

DROP FUNCTION IF EXISTS public.get_attempt_review(uuid);
CREATE OR REPLACE FUNCTION public.get_attempt_review(p_attempt_id uuid)
RETURNS TABLE (question_id uuid, position integer, section text, question text, options jsonb, passage text, answer_type text, selected_index smallint, correct_index smallint, explanation text, answer_text text, writing_score integer, writing_feedback jsonb, speaking_score integer, speaking_feedback jsonb, audio_storage_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_user_id text := auth.jwt() ->> 'sub';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.attempts WHERE id=p_attempt_id AND user_id=v_user_id AND state IN ('submitted','timed_out')) THEN RAISE EXCEPTION 'Completed attempt not found'; END IF;
  RETURN QUERY SELECT q.id,q.position,q.section,q.question,q.options,q.passage,q.answer_type,aa.selected_index,k.correct_index,k.explanation,aa.answer_text,aa.writing_score,aa.writing_feedback,aa.speaking_score,aa.speaking_feedback,aa.audio_storage_path
  FROM public.exam_questions q JOIN public.attempt_answers aa ON aa.question_id=q.id AND aa.attempt_id=p_attempt_id LEFT JOIN private.exam_answer_keys k ON k.question_id=q.id ORDER BY q.position;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_attempt_review(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_attempt_review(uuid) FROM public, anon;
