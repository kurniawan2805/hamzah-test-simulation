-- Migration: Add Admin Exam Bundle Import RPC and Storage Policies for exam-audio

CREATE OR REPLACE FUNCTION public.admin_import_exam_bundle(p_bundle jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_slug text;
  v_title text;
  v_subtitle text;
  v_duration integer;
  v_is_public boolean;
  v_pkg_id uuid;
  v_ver_id uuid;
  v_q_item jsonb;
  v_q_count integer := 0;
  v_qid uuid;
  v_pos integer := 0;
  v_section text;
  v_question text;
  v_options jsonb;
  v_correct_index smallint;
  v_explanation text;
  v_passage text;
  v_audio_path text;
  v_answer_type text;
  v_prompt_hint text;
  v_min_words integer;
  v_prep_sec integer;
  v_max_rec_sec integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  v_slug := coalesce(p_bundle->>'slug', p_bundle->>'id');
  IF v_slug IS NULL OR trim(v_slug) = '' THEN
    RAISE EXCEPTION 'Bundle slug/id is required';
  END IF;

  v_title := coalesce(p_bundle->>'title', 'Paket Ujian');
  v_subtitle := coalesce(p_bundle->>'subtitle', 'Simulasi Ujian');
  v_duration := coalesce((p_bundle->>'durationMinutes')::integer, (p_bundle->>'duration_minutes')::integer, 60);
  v_is_public := coalesce((p_bundle->>'isPublic')::boolean, (p_bundle->>'is_public')::boolean, true);

  -- Upsert package
  SELECT id INTO v_pkg_id FROM public.exam_packages WHERE slug = v_slug;
  IF v_pkg_id IS NULL THEN
    INSERT INTO public.exam_packages (slug, title, subtitle, is_public)
    VALUES (v_slug, v_title, v_subtitle, v_is_public)
    RETURNING id INTO v_pkg_id;
  ELSE
    UPDATE public.exam_packages
    SET title = v_title, subtitle = v_subtitle, is_public = v_is_public, updated_at = now()
    WHERE id = v_pkg_id;
  END IF;

  -- Upsert version 1
  SELECT id INTO v_ver_id FROM public.exam_versions WHERE package_id = v_pkg_id AND version_number = 1;
  IF v_ver_id IS NULL THEN
    INSERT INTO public.exam_versions (package_id, version_number, duration_minutes, status, published_at)
    VALUES (v_pkg_id, 1, v_duration, 'published', now())
    RETURNING id INTO v_ver_id;
  ELSE
    UPDATE public.exam_versions
    SET duration_minutes = v_duration, status = 'published', published_at = coalesce(published_at, now())
    WHERE id = v_ver_id;
  END IF;

  -- Delete existing questions for this version to ensure full sync
  DELETE FROM public.exam_questions WHERE exam_version_id = v_ver_id;

  -- Insert questions and answer keys
  FOR v_q_item IN SELECT * FROM jsonb_array_elements(p_bundle->'questions')
  LOOP
    v_pos := v_pos + 1;
    v_section := coalesce(v_q_item->>'section', 'reading');
    v_question := coalesce(v_q_item->>'question', '');
    v_options := v_q_item->'options';
    v_correct_index := coalesce((v_q_item->>'correct_index')::smallint, (v_q_item->>'correctIndex')::smallint, 0);
    v_explanation := coalesce(v_q_item->>'explanation', '');
    v_passage := v_q_item->>'passage';
    v_audio_path := coalesce(v_q_item->>'audio_path', v_q_item->>'audio_url', v_q_item->>'shared_asset_id');
    v_answer_type := coalesce(v_q_item->>'answer_type', v_q_item->>'answerType', 'multiple_choice');
    v_prompt_hint := v_q_item->>'prompt_hint';
    v_min_words := (v_q_item->>'minimum_words')::integer;
    v_prep_sec := (v_q_item->>'preparation_seconds')::integer;
    v_max_rec_sec := (v_q_item->>'max_recording_seconds')::integer;

    INSERT INTO public.exam_questions (
      exam_version_id, position, section, question, options, passage, audio_path,
      max_audio_plays, answer_type, prompt_hint, minimum_words, preparation_seconds, max_recording_seconds
    ) VALUES (
      v_ver_id, v_pos, v_section, v_question, v_options, v_passage, v_audio_path,
      1, v_answer_type, v_prompt_hint, v_min_words, v_prep_sec, v_max_rec_sec
    ) RETURNING id INTO v_qid;

    INSERT INTO private.exam_answer_keys (question_id, correct_index, explanation)
    VALUES (v_qid, v_correct_index, v_explanation)
    ON CONFLICT (question_id) DO UPDATE
    SET correct_index = excluded.correct_index,
        explanation = excluded.explanation;

    v_q_count := v_q_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'package_id', v_pkg_id,
    'version_id', v_ver_id,
    'slug', v_slug,
    'question_count', v_q_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_import_exam_bundle(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_exam_bundle(jsonb) TO authenticated;

-- Storage policies for exam-audio bucket (admin write / authenticated read)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admins can upload exam audio' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Admins can upload exam audio"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'exam-audio'
      AND public.is_admin()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update exam audio' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Admins can update exam audio"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'exam-audio'
      AND public.is_admin()
    )
    WITH CHECK (
      bucket_id = 'exam-audio'
      AND public.is_admin()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admins can delete exam audio' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Admins can delete exam audio"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'exam-audio'
      AND public.is_admin()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read exam audio' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Authenticated users can read exam audio"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'exam-audio'
    );
  END IF;
END $$;
