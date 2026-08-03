async function probeLocalFunction() {
  const baseUrl = Deno.env.get("AI_STUDY_LOCAL_URL") ?? "http://127.0.0.1:54321/functions/v1/ai-study";
  console.log(`Probing ${baseUrl} with a recommend payload...`);
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "recommend", section_scores: { grammar: 40, listening: 80, reading: 75, structures: 70 } }),
  });
  console.log(`Status: ${response.status}`);
  console.log(await response.text());
}

try {
  await probeLocalFunction();
} catch (err) {
  console.log(`Local edge function not reachable (${err instanceof Error ? err.message : String(err)}). Start supabase functions serve to test live.`);
}
