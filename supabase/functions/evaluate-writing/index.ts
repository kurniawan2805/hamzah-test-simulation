import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SYSTEM_PROMPT_WRITING } from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { attempt_id, answers: mockAnswers } = body;

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY environment variable is missing.");
    }

    // A. Demo / Mock Mode (Direct evaluation payload)
    if (mockAnswers && Array.isArray(mockAnswers)) {
      const evaluations = [];
      for (const item of mockAnswers) {
        const studentText = item.student_submission ? item.student_submission.trim() : "";
        if (!studentText) {
          evaluations.push({
            question_id: item.question_id,
            score: 0,
            grammar_score: 0,
            vocabulary_score: 0,
            feedback: {
              total_score: 0,
              feedback_id: "Tidak ada jawaban yang dikirimkan.",
              feedback_ar: "لم يتم تقديم أي إجابة.",
            },
          });
          continue;
        }

        const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT_WRITING },
              {
                role: "user",
                content: JSON.stringify({
                  prompt_question: item.question_text,
                  student_submission: studentText,
                }),
              },
            ],
          }),
        });

        if (!openAiResponse.ok) {
          const errBody = await openAiResponse.text();
          throw new Error(`OpenAI API Error: ${errBody}`);
        }

        const openAiData = await openAiResponse.json();
        const evalJson = JSON.parse(openAiData.choices[0].message.content);

        evaluations.push({
          question_id: item.question_id,
          score: evalJson.total_score,
          grammar_score: evalJson.grammar_score,
          vocabulary_score: evalJson.vocabulary_score,
          feedback: evalJson,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Writing evaluation completed (demo)",
          data: evaluations,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // B. Cloud Mode (Connected to Database)
    if (!attempt_id) {
      return new Response(
        JSON.stringify({ error: "Missing attempt_id or mock answers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get attempt questions and answers
    const { data: answers, error: fetchErr } = await supabase
      .from("attempt_answers")
      .select("question_id, answer_text, exam_questions!inner(question, answer_type)")
      .eq("attempt_id", attempt_id)
      .eq("exam_questions.answer_type", "writing");

    if (fetchErr) throw fetchErr;

    const evaluations = [];

    for (const item of (answers || [])) {
      const studentText = item.answer_text ? item.answer_text.trim() : "";
      const qData = Array.isArray(item.exam_questions) ? item.exam_questions[0] : item.exam_questions;
      const questionText = qData?.question ?? "";

      if (!studentText) {
        evaluations.push({
          question_id: item.question_id,
          score: 0,
          feedback: {
            total_score: 0,
            feedback_id: "Tidak ada jawaban yang dikirimkan.",
            feedback_ar: "لم يتم تقديم أي إجابة.",
            corrections: [],
            word_count: 0,
            is_word_count_valid: false,
            grammar_score: 0,
            vocabulary_score: 0,
            relevance_score: 0
          },
        });
        continue;
      }

      const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT_WRITING },
            {
              role: "user",
              content: JSON.stringify({
                prompt_question: questionText,
                student_submission: studentText,
              }),
            },
          ],
        }),
      });

      if (!openAiResponse.ok) {
        const errBody = await openAiResponse.text();
        throw new Error(`OpenAI API Error: ${errBody}`);
      }

      const openAiData = await openAiResponse.json();
      const evalJson = JSON.parse(openAiData.choices[0].message.content);

      evaluations.push({
        question_id: item.question_id,
        score: evalJson.total_score,
        feedback: evalJson,
      });
    }

    // Save grades and update scores
    if (evaluations.length > 0) {
      const { error: saveErr } = await supabase.rpc("save_writing_grades", {
        p_attempt_id: attempt_id,
        p_grades: evaluations,
      });
      if (saveErr) throw saveErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Writing evaluation completed and scores updated",
        data: evaluations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
