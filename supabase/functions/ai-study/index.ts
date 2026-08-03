import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { QUIZ_INSTRUCTIONS, SYSTEM_PROMPT } from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = Deno.env.get("AI_STUDY_MODEL") ?? "gpt-5.6-luna";
const QUIZ_SIZE = 5;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function userClient(authHeader: string) {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
}

function requireVip(authHeader: string): Promise<boolean> {
  return userClient(authHeader).rpc("ai_study_is_allowed").then(({ data, error }) => {
    if (error) throw error;
    return data === true;
  });
}

async function callResponses(messages: ChatMessage[], jsonSchema?: Record<string, unknown>): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is missing.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      instructions: SYSTEM_PROMPT,
      input: messages,
      temperature: 0.4,
      max_output_tokens: 4096,
      ...(jsonSchema ? { text: { format: { type: "json_schema", name: "quiz", schema: jsonSchema, strict: true } } } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API Error: ${body}`);
  }

  const data = await response.json();
  const outputText = typeof data.output_text === "string" ? data.output_text : "";
  if (!outputText) throw new Error("OpenAI returned an empty response.");
  return outputText;
}

const quizSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          correct_index: { type: "integer", minimum: 0, maximum: 3 },
          explanation: { type: "string" },
        },
        required: ["question", "options", "correct_index", "explanation"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

type GeneratedQuestion = {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

function parseGeneratedQuestions(raw: string): GeneratedQuestion[] {
  const parsed = JSON.parse(raw) as { questions?: unknown };
  if (!Array.isArray(parsed.questions)) throw new Error("Quiz generation returned an invalid shape.");
  return parsed.questions.map((item: unknown, index: number): GeneratedQuestion => {
    const row = item as Record<string, unknown>;
    const options = Array.isArray(row.options) ? row.options.map(String) : [];
    const correctIndex = typeof row.correct_index === "number" ? row.correct_index : -1;
    const question = typeof row.question === "string" ? row.question.trim() : "";
    const explanation = typeof row.explanation === "string" ? row.explanation.trim() : "";
    if (question.length === 0 || options.length !== 4 || correctIndex < 0 || correctIndex > 3 || explanation.length === 0) {
      throw new Error(`Generated question at index ${index} is invalid.`);
    }
    return { question, options, correct_index: correctIndex, explanation };
  });
}

function recommend(sectionScores: Record<string, number>) {
  const order = ["listening", "reading", "grammar", "structures"] as const;
  const scored = order.filter((section) => typeof sectionScores[section] === "number");
  if (scored.length === 0) return [];
  const weakest = Math.min(...scored.map((section) => sectionScores[section]));
  return scored
    .filter((section) => sectionScores[section] === weakest)
    .slice(0, 2)
    .map((section) => {
      if (section === "grammar" || section === "structures") {
        const topics: Record<string, string> = {
          grammar: "grammar_huruf_jar",
          structures: "structures_kaana",
        };
        return { topicId: topics[section], section, label: section === "grammar" ? "Huruf Jar" : "Kaana wa Akhwatuha", reason: `Skor ${section} adalah yang terendah.` };
      }
      return { topicId: null, section, label: `Latihan ${section}`, reason: `Skor ${section} adalah yang terendah.` };
    });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const body = await req.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";

    if (!(await requireVip(authHeader))) {
      return new Response(JSON.stringify({ error: "Akses ditolak: fitur khusus VIP+" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = userClient(authHeader);

    if (action === "recommend") {
      const scores = (body.section_scores ?? {}) as Record<string, number>;
      return new Response(JSON.stringify({ recommendations: recommend(scores) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "lesson") {
      const topic = typeof body.topic === "string" ? body.topic : "";
      const section = typeof body.section === "string" ? body.section : "";
      if (!sessionId || !topic) throw new Error("session_id dan topic wajib diisi.");
      const content = await callResponses([
        { role: "user", content: JSON.stringify({ request: "lesson", topic, section }) },
      ]);
      await client.rpc("ai_study_append_message", { p_session_id: sessionId, p_role: "assistant", p_content: content });
      return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "quiz_generate") {
      const topic = typeof body.topic === "string" ? body.topic : "";
      if (!sessionId || !topic) throw new Error("session_id dan topic wajib diisi.");

      const { data: quizRow, error: beginError } = await client.rpc("ai_study_begin_quiz", { p_session_id: sessionId });
      if (beginError) throw beginError;
      const quizId = String(quizRow);

      const { data: bankRows, error: pickError } = await client.rpc("ai_study_pick_questions", {
        p_topic: topic,
        p_limit: QUIZ_SIZE,
      });
      if (pickError) throw pickError;

      const bank = Array.isArray(bankRows) ? bankRows : [];
      const bankItems = bank.map((row: Record<string, unknown>) => ({
        question_id: String(row.question_id),
        question: String(row.question),
        options: Array.isArray(row.options) ? row.options.map(String) : [],
        passage: typeof row.passage === "string" ? row.passage : null,
      }));

      const missing = Math.max(0, QUIZ_SIZE - bankItems.length);
      let generated: GeneratedQuestion[] = [];
      if (missing > 0) {
        const raw = await callResponses(
          [
            { role: "system", content: QUIZ_INSTRUCTIONS },
            { role: "user", content: JSON.stringify({ request: "quiz", topic, section: body.section ?? "", count: missing }) },
          ],
          quizSchema,
        );
        generated = parseGeneratedQuestions(raw).slice(0, missing);
      }

      const questions = [
        ...bankItems.map((item) => ({ question_id: item.question_id, question: item.question, options: item.options, passage: item.passage })),
        ...generated.map((item) => ({ question: item.question, options: item.options, passage: null })),
      ];
      const keys = [
        ...bankItems.map((item) => ({ question_id: item.question_id })),
        ...generated.map((item) => ({ correct_index: item.correct_index, explanation: item.explanation })),
      ];

      const admin = adminClient();
      const { error: updateError } = await admin
        .from("ai_study_quizzes")
        .update({ questions, question_count: questions.length })
        .eq("id", quizId);
      if (updateError) throw updateError;
      const { error: keysError } = await admin.from("ai_study_quiz_keys").insert({ quiz_id: quizId, keys });
      if (keysError) throw keysError;

      return new Response(JSON.stringify({ quiz_id: quizId, questions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "grade") {
      const quizId = typeof body.quiz_id === "string" ? body.quiz_id : "";
      const answers = Array.isArray(body.answers) ? body.answers.map((value) => (typeof value === "number" ? value : -1)) : [];
      if (!quizId) throw new Error("quiz_id wajib diisi.");
      const { data, error } = await client.rpc("ai_study_grade_quiz", { p_quiz_id: quizId, p_answers: answers });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return new Response(JSON.stringify(row ?? { score: 0, correct_count: 0, questions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "chat") {
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!sessionId || !message) throw new Error("session_id dan message wajib diisi.");

      const { data: usage } = await client.rpc("ai_study_usage_remaining");
      const usageRow = Array.isArray(usage) ? usage[0] : usage;
      if (!usageRow || Number(usageRow.messages_remaining) <= 0) {
        return new Response(JSON.stringify({ error: "Kuota pesan harian habis (30 pesan/hari)." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: appendError } = await client.rpc("ai_study_append_message", {
        p_session_id: sessionId,
        p_role: "user",
        p_content: message,
      });
      if (appendError) throw appendError;

      const { data: sessionRows, error: sessionError } = await client
        .from("ai_study_sessions")
        .select("topic, section")
        .eq("id", sessionId)
        .limit(1);
      if (sessionError) throw sessionError;
      const session = Array.isArray(sessionRows) ? sessionRows[0] : sessionRows;

      const { data: messageRows, error: historyError } = await client
        .from("ai_study_messages")
        .select("role, content")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(20);
      if (historyError) throw historyError;

      const history = (Array.isArray(messageRows) ? messageRows : []).map((row: Record<string, unknown>) => ({
        role: String(row.role) === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(row.content),
      }));
      const topic = typeof session?.topic === "string" ? session.topic : "";
      const section = typeof session?.section === "string" ? session.section : "";
      const reply = await callResponses([
        ...history,
        { role: "user", content: `Topik aktif: ${topic} (${section}). Lanjutkan diskusi tentang topik ini.` },
      ]);

      const { error: replyError } = await client.rpc("ai_study_append_message", {
        p_session_id: sessionId,
        p_role: "assistant",
        p_content: reply,
      });
      if (replyError) throw replyError;

      return new Response(JSON.stringify({ reply }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Action tidak dikenal." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
