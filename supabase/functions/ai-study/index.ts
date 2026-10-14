import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";
import { studyHandler } from "../_shared/ai-study-handler.ts";
import type { StudyMessage } from "../_shared/ai-study-handler.ts";
import { QUIZ_INSTRUCTIONS, SYSTEM_PROMPT } from "./prompt.ts";

const env = (key: string) => Deno.env.get(key);
const client = (authorization: string) => createClient(env("SUPABASE_URL")!, env("SUPABASE_ANON_KEY")!, {
  global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
});
const admin = () => createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!);

serve(studyHandler({
  env, request: fetch,
  allowed: async (authorization) => {
    const { data, error } = await client(authorization).rpc("ai_study_is_allowed");
    return !error && data === true;
  },
  userRpc: async (authorization, name, args) => {
    const { data, error } = await client(authorization).rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  },
  adminRpc: async (name, args) => {
    const { data, error } = await admin().rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  },
  history: async (authorization, sessionId): Promise<StudyMessage[]> => {
    const { data, error } = await client(authorization).from("ai_study_messages")
      .select("role,content").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).reverse().map(row => ({ role: row.role === "assistant" ? "assistant" : "user", content: String(row.content) }));
  },
}, SYSTEM_PROMPT, QUIZ_INSTRUCTIONS));
