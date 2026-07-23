-- Allow participants to replace their own speaking recording and review it
-- after the attempt has been submitted. Storage upsert requires SELECT and
-- UPDATE in addition to INSERT.

CREATE POLICY "Users can update their speaking audio"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'exam-audio'
  AND (storage.foldername(name))[1] = 'speaking'
  AND EXISTS (
    SELECT 1
    FROM public.attempts
    WHERE id = ((storage.foldername(name))[2])::uuid
      AND user_id = (auth.jwt() ->> 'sub')
      AND state = 'active'
      AND ends_at > now()
  )
)
WITH CHECK (
  bucket_id = 'exam-audio'
  AND (storage.foldername(name))[1] = 'speaking'
  AND EXISTS (
    SELECT 1
    FROM public.attempts
    WHERE id = ((storage.foldername(name))[2])::uuid
      AND user_id = (auth.jwt() ->> 'sub')
      AND state = 'active'
      AND ends_at > now()
  )
);

CREATE POLICY "Users can read their speaking audio"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'exam-audio'
  AND (storage.foldername(name))[1] = 'speaking'
  AND EXISTS (
    SELECT 1
    FROM public.attempts
    WHERE id = ((storage.foldername(name))[2])::uuid
      AND user_id = (auth.jwt() ->> 'sub')
      AND state IN ('active', 'submitted', 'timed_out')
  )
);
