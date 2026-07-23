import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SYSTEM_PROMPT_SPEAKING } from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY environment variable is missing.");
    }

    const body = await req.json();
    const { attempt_id, answers: mockAnswers } = body;

    // A. Demo / Mock Mode (Direct JSON payload with base64 audio)
    if (mockAnswers && Array.isArray(mockAnswers)) {
      const evaluations = [];

      for (const item of mockAnswers) {
        const base64Audio = item.audio_base64 || "";
        const questionId = item.question_id;
        const questionText = item.question_text;

        if (!base64Audio.trim()) {
          evaluations.push({
            question_id: questionId,
            score: 0,
            feedback: {
              total_score: 0,
              pronunciation_score: 0,
              fluency_score: 0,
              relevance_score: 0,
              transcript: "",
              corrections: [],
              feedback_id: "Tidak ada rekaman audio yang diterima.",
              feedback_ar: "لم يتم استلام أي تسجيل صوتي.",
            },
          });
          continue;
        }

        // Convert base64 to Blob
        let audioBlob: Blob;
        try {
          const binaryString = atob(base64Audio);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let j = 0; j < len; j++) {
            bytes[j] = binaryString.charCodeAt(j);
          }
          audioBlob = new Blob([bytes], { type: "audio/webm" });
        } catch (err) {
          throw new Error(`Failed to decode base64 audio for question ${questionId}: ${err}`, { cause: err });
        }

        // 1. Send to OpenAI Whisper
        const whisperForm = new FormData();
        whisperForm.append("file", audioBlob, "audio.webm");
        whisperForm.append("model", "whisper-1");
        whisperForm.append("language", "ar");

        const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
          },
          body: whisperForm,
        });

        if (!whisperResponse.ok) {
          const errText = await whisperResponse.text();
          throw new Error(`Whisper API Error: ${errText}`);
        }

        const whisperData = await whisperResponse.json();
        const transcriptText = whisperData.text || "";

        if (!transcriptText.trim()) {
          evaluations.push({
            question_id: questionId,
            score: 0,
            feedback: {
              total_score: 0,
              pronunciation_score: 0,
              fluency_score: 0,
              relevance_score: 0,
              transcript: "",
              corrections: [],
              feedback_id: "Tidak terdeteksi ucapan dalam rekaman.",
              feedback_ar: "لم يتم الكشف عن أي كلام في التسجيل.",
            },
          });
          continue;
        }

        // 2. Evaluate transcription with GPT-4o-mini
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
              { role: "system", content: SYSTEM_PROMPT_SPEAKING },
              {
                role: "user",
                content: JSON.stringify({
                  prompt_question: questionText,
                  whisper_transcript: transcriptText,
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
        evalJson.transcript = transcriptText;

        evaluations.push({
          question_id: questionId,
          score: evalJson.total_score,
          feedback: evalJson,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Speaking evaluation completed (demo)",
          data: evaluations,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // B. Cloud Mode (Connected to Database using attempt_id)
    if (!attempt_id) {
      return new Response(
        JSON.stringify({ error: "Missing attempt_id or mock answers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch speaking answers
    const { data: answers, error: fetchErr } = await supabase
      .from("attempt_answers")
      .select("question_id, audio_storage_path, exam_questions!inner(question, answer_type)")
      .eq("attempt_id", attempt_id)
      .eq("exam_questions.answer_type", "speaking");

    if (fetchErr) throw fetchErr;

    const evaluations = [];

    for (const item of (answers || [])) {
      const audioPath = item.audio_storage_path;
      const questionText = item.exam_questions.question;

      if (!audioPath) {
        evaluations.push({
          question_id: item.question_id,
          score: 0,
          feedback: {
            total_score: 0,
            pronunciation_score: 0,
            fluency_score: 0,
            relevance_score: 0,
            transcript: "",
            corrections: [],
            feedback_id: "Tidak ada rekaman audio yang dikirimkan.",
            feedback_ar: "لم يتم تقديم أي تسجيل صوتي.",
          },
        });
        continue;
      }

      // 1. Download file from Storage
      const { data: audioBlob, error: downloadErr } = await supabase.storage
        .from("exam-audio")
        .download(audioPath);

      if (downloadErr || !audioBlob) {
        console.error(`Failed to download audio at ${audioPath}:`, downloadErr);
        evaluations.push({
          question_id: item.question_id,
          score: 0,
          feedback: {
            total_score: 0,
            pronunciation_score: 0,
            fluency_score: 0,
            relevance_score: 0,
            transcript: "",
            corrections: [],
            feedback_id: "Gagal mengunduh berkas audio dari penyimpanan.",
            feedback_ar: "فشل تنزيل ملف الصوت من التخزين.",
          },
        });
        continue;
      }

      // 2. Whisper transcription
      const whisperForm = new FormData();
      whisperForm.append("file", audioBlob, "audio.webm");
      whisperForm.append("model", "whisper-1");
      whisperForm.append("language", "ar");

      const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
        },
        body: whisperForm,
      });

      if (!whisperResponse.ok) {
        const errText = await whisperResponse.text();
        throw new Error(`Whisper API Error: ${errText}`);
      }

      const whisperData = await whisperResponse.json();
      const transcriptText = whisperData.text || "";

      if (!transcriptText.trim()) {
        evaluations.push({
          question_id: item.question_id,
          score: 0,
          feedback: {
            total_score: 0,
            pronunciation_score: 0,
            fluency_score: 0,
            relevance_score: 0,
            transcript: "",
            corrections: [],
            feedback_id: "Tidak terdeteksi ucapan dalam rekaman.",
            feedback_ar: "لم يتم الكشف عن أي كلام في التسجيل.",
          },
        });
        continue;
      }

      // 3. GPT-4o-mini Evaluation
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
            { role: "system", content: SYSTEM_PROMPT_SPEAKING },
            {
              role: "user",
              content: JSON.stringify({
                prompt_question: questionText,
                whisper_transcript: transcriptText,
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
      evalJson.transcript = transcriptText;

      evaluations.push({
        question_id: item.question_id,
        score: evalJson.total_score,
        feedback: evalJson,
      });
    }

    // Save grades in database
    if (evaluations.length > 0) {
      const { error: saveErr } = await supabase.rpc("save_speaking_grades", {
        p_attempt_id: attempt_id,
        p_grades: evaluations,
      });
      if (saveErr) throw saveErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Speaking evaluation completed and scores updated",
        data: evaluations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
