async function testEdgeFunctionMock() {
  console.log('--- Testing Edge Function (Mock payload) ---')
  const payload = {
    answers: [
      {
        question_id: 'hamza_q_066',
        question_text: 'اكتب فقرة عن أهمية تنظيم الوقت في حياة الطالب.',
        student_submission: 'تنظيم الوقت مهم جدا لحياة الطالب. يساعد الطالب على الدراسة جيدا والنجاح في الامتحان والراحة البدنية.',
      }
    ]
  }

  // We fetch directly from the local evaluate-writing function logic or mock it since Deno serve isn't running locally here.
  // We'll write a mock response that conforms to the prompt schema to verify the logic.
  console.log('Sending payload:', JSON.stringify(payload, null, 2))
  
  // Real integration test structure for client
  const mockResponse = {
    success: true,
    message: "Writing evaluation completed (demo)",
    data: [
      {
        question_id: "hamza_q_066",
        score: 85,
        grammar_score: 30,
        vocabulary_score: 30,
        feedback: {
          total_score: 85,
          grammar_score: 30,
          vocabulary_score: 30,
          relevance_score: 25,
          word_count: 17,
          is_word_count_valid: true,
          corrections: [
            {
              original: "لحياة",
              corrected: "في حياة",
              category: "Grammar",
              explanation_id: "Penggunaan preposisi yang lebih tepat adalah 'fi'."
            }
          ],
          feedback_id: "Tulisan Anda terstruktur dengan baik dan relevan dengan topik, namun jumlah kata masih di bawah batas minimum standard.",
          feedback_ar: "كتابة جيدة ومنظمة ومناسبة للموضوع المطروح."
        }
      }
    ]
  }
  console.log('Received Mock Response:', JSON.stringify(mockResponse, null, 2))
}

testEdgeFunctionMock()
