-- Fix PL/pgSQL ambiguity between the return variable exam_version_id and
-- public.attempts.exam_version_id when resuming an active attempt.
CREATE OR REPLACE FUNCTION public.start_attempt(p_exam_version_id uuid)
RETURNS TABLE (
  attempt_id uuid,
  exam_version_id uuid,
  started_at timestamptz,
  ends_at timestamptz,
  state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id text := auth.jwt() ->> 'sub';
  v_duration_minutes integer;
  v_attempt public.attempts;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT ev.duration_minutes INTO v_duration_minutes
  FROM public.exam_versions AS ev
  WHERE ev.id = p_exam_version_id
    AND ev.status = 'published';

  IF v_duration_minutes IS NULL THEN
    RAISE EXCEPTION 'Published exam version not found';
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.attempts AS a
  WHERE a.user_id = v_user_id
    AND a.exam_version_id = p_exam_version_id
    AND a.state = 'active'
  FOR UPDATE;

  IF FOUND AND v_attempt.ends_at > now() THEN
    RETURN QUERY SELECT v_attempt.id, v_attempt.exam_version_id,
      v_attempt.started_at, v_attempt.ends_at, v_attempt.state;
    RETURN;
  END IF;

  IF FOUND THEN
    PERFORM public.finish_attempt(v_attempt.id);
  END IF;

  INSERT INTO public.attempts (user_id, exam_version_id, ends_at)
  VALUES (v_user_id, p_exam_version_id,
    now() + make_interval(mins => v_duration_minutes))
  RETURNING * INTO v_attempt;

  INSERT INTO public.attempt_answers (attempt_id, question_id)
  SELECT v_attempt.id, q.id
  FROM public.exam_questions AS q
  WHERE q.exam_version_id = p_exam_version_id;

  RETURN QUERY SELECT v_attempt.id, v_attempt.exam_version_id,
    v_attempt.started_at, v_attempt.ends_at, v_attempt.state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_attempt(uuid) TO authenticated;
