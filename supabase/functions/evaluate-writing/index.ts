import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";
import { evaluationHandler } from "../_shared/evaluation-handler.ts";
import { SYSTEM_PROMPT_WRITING } from "./prompt.ts";

const env = (name: string) => Deno.env.get(name);
const admin = () => createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!);

serve(evaluationHandler("writing", SYSTEM_PROMPT_WRITING, {
  env,
  request: fetch,
  authorize: async (authorization, attemptId) => {
    const client = createClient(env("SUPABASE_URL")!, env("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { error } = await client.rpc("get_attempt_review", { p_attempt_id: attemptId });
    return !error;
  },
  answers: async (attemptId) => {
    const { data, error } = await admin().from("attempt_answers")
      .select("question_id, answer_text, exam_questions!inner(question, answer_type)")
      .eq("attempt_id", attemptId).eq("exam_questions.answer_type", "writing");
    if (error) throw error;
    return (data ?? []).map((row) => {
      const question = Array.isArray(row.exam_questions) ? row.exam_questions[0] : row.exam_questions;
      return { questionId: row.question_id, question: question?.question ?? "", text: row.answer_text };
    });
  },
  download: async (path) => {
    const { data, error } = await admin().storage.from("exam-audio").download(path);
    if (error || !data) throw new Error("Recording download failed");
    return data;
  },
  save: async (attemptId, grades) => {
    const { error } = await admin().rpc("save_writing_grades", { p_attempt_id: attemptId, p_grades: grades });
    if (error) throw error;
  },
}));
