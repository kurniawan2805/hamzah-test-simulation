import { demoExam } from "../data/exam-data"
import { useExamStore } from "../store/exam-store"
import type { AiChatMessage, AiQuiz, AiQuizResult, AiQuizResultQuestion, AiStudyAdapter, AiTopicState } from "./ai-study"
import { pickBankQuestions, toPublicBankQuestion } from "./ai-study-bank"
import { dateKeyLocal, getAiStudyQuota } from "./ai-study-quota"

const DEMO_LESSONS: Record<string, string> = {
  grammar_huruf_jar:
    "Contoh materi (mode demo): Huruf jar adalah preposisi Arab seperti إِلَى (ke), مِن (dari), dan فِي (di dalam). Huruf jar membuat kata benda setelahnya berharakat kasrah, misalnya ذَهَبْتُ إِلَى الْمَسْجِدِ (aku pergi ke masjid).",
  grammar_fiil_madhi_mudhari:
    "Contoh materi (mode demo): Fi'il madhi adalah kata kerja lampau seperti كَتَبَ (dia telah menulis), sedangkan fi'il mudhari' adalah kata kerja sekarang seperti يَكْتُبُ (dia sedang menulis). Pelaku menentukan konjugasi, contoh: كَتَبَ الطَّالِبُ الدَّرْسَ.",
  grammar_mubtada_khabar:
    "Contoh materi (mode demo): Kalimat nominal terdiri atas mubtada' (subjek) dan khabar (predikat), contoh الْبَيْتُ كَبِيرٌ (rumah itu besar). Mubtada' wajib marfu' dan khabar menyesuaikan jenis serta jumlahnya.",
  structures_kaana:
    "Contoh materi (mode demo): كَانَ dan saudara-saudaranya (أَخَوَاتُهَا) menyalin kalimat nominal: mubtada' menjadi isim kaana, khabar menjadi khabar kaana. Contoh كَانَ الْجَوُّ جَمِيلًا (cuaca itu indah).",
  structures_isim_majrur:
    "Contoh materi (mode demo): Isim majrur adalah kata benda berharakat kasrah karena didahului huruf jar atau menjadi mudhaf ilaih. Contoh ذَهَبْتُ إِلَى الْمَسْجِدِ: kata الْمَسْجِدِ berharakat kasrah setelah إِلَى.",
}

const DEMO_REPLIES = [
  "Contoh jawaban AI (mode demo): Coba perhatikan posisi kata setelah huruf jar. Kata itu harus berharakat kasrah dan menjadi isim majrur.",
  "Contoh jawaban AI (mode demo): Bagus, pertanyaan itu tepat sasaran. Latihan soal di panel atas akan menguatkan pemahaman topik ini.",
  "Contoh jawaban AI (mode demo): Di mode demo jawaban ini sudah disiapkan. Di mode cloud, AI akan menjawab sesuai topik yang sedang kamu pelajari.",
]

type DemoPoolQuestion = {
  question: string
  options: [string, string, string, string]
  correct_index: number
  explanation: string
}

const DEMO_QUIZ_POOL: Record<string, DemoPoolQuestion[]> = {
  grammar_huruf_jar: [
    {
      question: "أَكْمِلِ الْجُمْلَةَ: ذَهَبْنَا ______ الْمَسْجِدِ.",
      options: ["إِلَى", "عَلَى", "مِنْ", "عِنْدَ"],
      correct_index: 0,
      explanation: "Huruf jar إِلَى (ke) adalah preposisi arah yang tepat untuk kalimat \"kami pergi ke masjid\".",
    },
    {
      question: "أَيُّ جُمْلَةٍ تَحْتَوِي عَلَى حَرْفِ جَرٍّ؟",
      options: ["جَاءَ الْمُعَلِّمُ.", "قَرَأْتُ الْكِتَابَ.", "سَكَنْتُ فِي الْمَدِينَةِ.", "كَتَبَ الطَّالِبُ الدَّرْسَ."],
      correct_index: 2,
      explanation: "فِي adalah huruf jar; kata الْمَدِينَةِ setelahnya berharakat kasrah.",
    },
    {
      question: "أَكْمِلِ الْجُمْلَةَ: الْكِتَابُ عَلَى ______.",
      options: ["الْمَكْتَبِ", "الْمَكْتَبَ", "الْمَكْتَبُ", "مَكْتَبٌ"],
      correct_index: 0,
      explanation: "عَلَى adalah huruf jar, sehingga kata setelahnya menjadi isim majrur: الْمَكْتَبِ.",
    },
    {
      question: "اخْتَرِ الْجُمْلَةَ الصَّحِيحَةَ:",
      options: ["خَرَجْتُ مِنَ الْبَيْتِ.", "خَرَجْتُ مِنَ الْبَيْتَ.", "خَرَجْتُ مِنَ الْبَيْتُ.", "خَرَجْتُ مِنَ الْبَيْتًا."],
      correct_index: 0,
      explanation: "مِنْ adalah huruf jar; kata setelahnya berharakat kasrah: الْبَيْتِ.",
    },
    {
      question: "أَكْمِلِ الْجُمْلَةَ: ذَهَبَ الْوَلَدُ إِلَى ______.",
      options: ["الْمَدْرَسَةِ", "الْمَدْرَسَةَ", "الْمَدْرَسَةُ", "مَدْرَسَةٌ"],
      correct_index: 0,
      explanation: "إِلَى menuntut isim majrur, sehingga bentuk yang benar adalah الْمَدْرَسَةِ.",
    },
  ],
  grammar_fiil_madhi_mudhari: [
    {
      question: "اخْتَرِ الْكَلِمَةَ الصَّحِيحَةَ: الطَّالِبُ ______ الدَّرْسَ الْآنَ.",
      options: ["يَقْرَأُ", "قَرَأَ", "سَيَقْرَأُ", "اقْرَأْ"],
      correct_index: 0,
      explanation: "الْآنَ (sekarang) menuntut fi'il mudhari' يَقْرَأُ, bukan fi'il madhi.",
    },
    {
      question: "أَيُّ كَلِمَةٍ فِعْلٌ مَاضٍ؟",
      options: ["يَكْتُبُ", "كَتَبَ", "سَيَكْتُبُ", "اُكْتُبْ"],
      correct_index: 1,
      explanation: "كَتَبَ adalah fi'il madhi; يَكْتُبُ dan سَيَكْتُبُ adalah mudhari'.",
    },
  ],
  grammar_mubtada_khabar: [
    {
      question: "أَكْمِلْ: ______ كَبِيرٌ.",
      options: ["الْبَيْتُ", "الْبَيْتَ", "الْبَيْتِ", "بَيْتًا"],
      correct_index: 0,
      explanation: "Mubtada' wajib marfu', sehingga bentuk yang benar adalah الْبَيْتُ.",
    },
    {
      question: "اخْتَرِ الْجُمْلَةَ الْاِسْمِيَّةَ:",
      options: ["ذَهَبَ أَحْمَدُ.", "الْجَوُّ جَمِيلٌ.", "يَلْعَبُ الْوَلَدُ.", "اِقْرَأِ الْكِتَابَ."],
      correct_index: 1,
      explanation: "Kalimat nominal dimulai mubtada' (الْجَوُّ) lalu khabar (جَمِيلٌ).",
    },
    {
      question: "أَكْمِلْ: الْبِنْتُ ______.",
      options: ["مُجْتَهِدَةٌ", "مُجْتَهِدٌ", "مُجْتَهِدِينَ", "مُجْتَهِدَانِ"],
      correct_index: 0,
      explanation: "Khabar menyesuaikan mubtada' feminin tunggal: مُجْتَهِدَةٌ.",
    },
    {
      question: "اخْتَرِ الْجُمْلَةَ الصَّحِيحَةَ:",
      options: ["الْوَلَدَانِ مُجْتَهِدَانِ.", "الْوَلَدَانِ مُجْتَهِدٌ.", "الْوَلَدَانِ مُجْتَهِدُونَ.", "الْوَلَدَانِ مُجْتَهِدَةٌ."],
      correct_index: 0,
      explanation: "Mubtada' mutsanna menuntut khabar mutsanna: مُجْتَهِدَانِ.",
    },
    {
      question: "أَكْمِلْ: الطَّالِبَاتُ ______.",
      options: ["مُجْتَهِدَاتٌ", "مُجْتَهِدُونَ", "مُجْتَهِدَةٌ", "مُجْتَهِدًا"],
      correct_index: 0,
      explanation: "Mubtada' jamak feminin menuntut khabar jamak feminin: مُجْتَهِدَاتٌ.",
    },
  ],
  structures_kaana: [
    {
      question: "أَكْمِلْ: كَانَ الْجَوُّ ______.",
      options: ["جَمِيلًا", "جَمِيلٌ", "جَمِيلٍ", "جَمِيلَ"],
      correct_index: 0,
      explanation: "Setelah كَانَ, khabar menjadi khabar kaana yang manshub: جَمِيلًا.",
    },
    {
      question: "اخْتَرِ الصِّيغَةَ الصَّحِيحَةَ: كَانَ الطُّلَّابُ ______ الدَّرْسَ.",
      options: ["يَدْرُسُونَ", "يَدْرُسُ", "دَرَسَ", "دَرَسُوا"],
      correct_index: 0,
      explanation: "Isim kaana (الطُّلَّابُ) jamak, sehingga khabar kaana memakai يَدْرُسُونَ.",
    },
    {
      question: "اخْتَرِ الصِّيغَةَ الصَّحِيحَةَ: لَيْسَ الْجَوُّ ______.",
      options: ["حَارًّا", "حَارٌّ", "حَارٍّ", "حَارَّ"],
      correct_index: 0,
      explanation: "لَيْسَ menyalin kalimat nominal dan menashabkan khabarnya: حَارًّا.",
    },
    {
      question: "أَكْمِلْ: كَانَ الطَّالِبَانِ ______.",
      options: ["مُجْتَهِدَيْنِ", "مُجْتَهِدَانِ", "مُجْتَهِدُونَ", "مُجْتَهِدًا"],
      correct_index: 0,
      explanation: "Isim kaana mutsanna, sehingga khabar kaana manshub mutsanna: مُجْتَهِدَيْنِ.",
    },
    {
      question: "اخْتَرِ الْجُمْلَةَ الصَّحِيحَةَ:",
      options: ["كَانَتِ الْبِنْتُ مُجْتَهِدَةً.", "كَانَتِ الْبِنْتُ مُجْتَهِدَةٌ.", "كَانَتِ الْبِنْتُ مُجْتَهِدًا.", "كَانَتِ الْبِنْتُ مُجْتَهِدِينَ."],
      correct_index: 0,
      explanation: "Khabar kaana mengikuti jenis isim kaana, feminin manshub: مُجْتَهِدَةً.",
    },
  ],
  structures_isim_majrur: [
    {
      question: "أَيُّ كَلِمَةٍ اسْمٌ مَجْرُورٌ فِي: ذَهَبْتُ إِلَى الْمَسْجِدِ؟",
      options: ["ذَهَبْتُ", "إِلَى", "الْمَسْجِدِ", "الْمَسْجِدُ"],
      correct_index: 2,
      explanation: "الْمَسْجِدِ berharakat kasrah karena didahului huruf jar إِلَى.",
    },
    {
      question: "أَكْمِلْ بِالْكَلِمَةِ الصَّحِيحَةِ: جَلَسْتُ عَلَى ______.",
      options: ["الْكُرْسِيِّ", "الْكُرْسِيَّ", "الْكُرْسِيُّ", "كُرْسِيٌّ"],
      correct_index: 0,
      explanation: "Setelah عَلَى, kata benda menjadi isim majrur dengan kasrah: الْكُرْسِيِّ.",
    },
    {
      question: "أَيُّ كَلِمَةٍ اسْمٌ مَجْرُورٌ فِي: جَلَسْتُ عَلَى الْكُرْسِيِّ؟",
      options: ["جَلَسْتُ", "عَلَى", "الْكُرْسِيِّ", "الْكُرْسِيَّ"],
      correct_index: 2,
      explanation: "الْكُرْسِيِّ majrur karena didahului huruf jar عَلَى.",
    },
    {
      question: "أَكْمِلْ بِالْكَلِمَةِ الصَّحِيحَةِ: هَذَا كِتَابُ ______.",
      options: ["الْمُعَلِّمِ", "الْمُعَلِّمَ", "الْمُعَلِّمُ", "مُعَلِّمًا"],
      correct_index: 0,
      explanation: "Kata setelah mudhaf berkedudukan mudhaf ilaih yang majrur: الْمُعَلِّمِ.",
    },
    {
      question: "أَيُّ جُمْلَةٍ تَحْتَوِي عَلَى اسْمٍ مَجْرُورٍ؟",
      options: ["دَخَلَ الطَّالِبُ الْفَصْلَ.", "نَظَرْتُ إِلَى السَّمَاءِ.", "كَتَبَ الْكِتَابَ.", "شَرِبَ الْحَلِيبَ."],
      correct_index: 1,
      explanation: "السَّمَاءِ majrur karena didahului huruf jar إِلَى.",
    },
  ],
}

function demoState(topicId: string): AiTopicState {
  const session = useExamStore.getState().demoAiStudySessions[topicId]
  if (!session) return { lessonLoaded: false, messages: [], quiz: null, quizAnswers: [], quizResult: null }
  return {
    lessonLoaded: session.lessonLoaded,
    messages: session.messages,
    quiz: session.quiz,
    quizAnswers: session.quizAnswers ?? [],
    quizResult: session.quizResult,
  }
}

function persistState(topicId: string, state: AiTopicState): void {
  useExamStore.getState().saveDemoAiStudySession({
    topicId,
    lessonLoaded: state.lessonLoaded,
    messages: state.messages,
    quiz: state.quiz,
    quizAnswers: state.quizAnswers,
    quizResult: state.quizResult,
  })
}

function withMessage(state: AiTopicState, role: "user" | "assistant", content: string): AiTopicState {
  const message: AiChatMessage = {
    id: `demo-msg-${Date.now()}-${state.messages.length}`,
    role,
    content,
    createdAt: Date.now(),
  }
  return { ...state, lessonLoaded: state.lessonLoaded || role === "assistant", messages: [...state.messages, message] }
}

function currentUsage() {
  return getAiStudyQuota(useExamStore.getState().demoAiStudyUsage ?? undefined, new Date())
}

function recordUsage(messages: number, quizzes: number): void {
  const today = dateKeyLocal(new Date())
  const previous = useExamStore.getState().demoAiStudyUsage
  const base = previous && previous.date === today ? previous : { date: today, messagesUsed: 0, quizzesUsed: 0 }
  useExamStore.getState().saveDemoAiStudyUsage({
    date: today,
    messagesUsed: base.messagesUsed + messages,
    quizzesUsed: base.quizzesUsed + quizzes,
  })
}

export const demoAiStudyAdapter: AiStudyAdapter = {
  async loadTopicState(topicId) {
    return demoState(topicId)
  },
  async loadLesson(topicId) {
    const quota = currentUsage()
    if (quota.messagesExhausted) throw new Error("Kuota pesan harian habis (30 pesan/hari).")
    const lesson = DEMO_LESSONS[topicId] ?? DEMO_LESSONS.grammar_huruf_jar
    const next = withMessage(demoState(topicId), "assistant", lesson)
    recordUsage(1, 0)
    persistState(topicId, next)
    return next
  },
  async generateQuiz(topicId) {
    const quota = currentUsage()
    if (quota.quizzesExhausted) throw new Error("Kuota kuis harian habis (10 kuis/hari).")
    const bank = pickBankQuestions(demoExam.questions, topicId, 5).map((item) => toPublicBankQuestion(item))
    const pool = DEMO_QUIZ_POOL[topicId] ?? []
    const fill = pool.slice(0, Math.max(0, 5 - bank.length))
    const questions = [
      ...bank.map((item, index) => ({ index, question: item.question, options: item.options, passage: item.passage, questionId: item.id })),
      ...fill.map((item, index) => ({ index: bank.length + index, question: item.question, options: item.options })),
    ]
    const quiz: AiQuiz = {
      id: `demo-quiz-${topicId}-${Date.now()}`,
      topicId,
      questions,
      createdAt: Date.now(),
    }
    recordUsage(0, 1)
    const state: AiTopicState = { ...demoState(topicId), quiz, quizAnswers: [], quizResult: null }
    persistState(topicId, state)
    return state
  },
  async gradeQuiz(topicId, quizId, answers) {
    const state = demoState(topicId)
    const quiz = state.quiz
    if (!quiz || quiz.id !== quizId) throw new Error("Kuis tidak ditemukan.")
    const correctIndexByQuestionId = new Map(demoExam.questions.map((question) => [question.id, question.correct_index]))
    const explanationByQuestionId = new Map(demoExam.questions.map((question) => [question.id, question.explanation]))
    const poolByTopic = DEMO_QUIZ_POOL[topicId] ?? []
    const resultQuestions: AiQuizResultQuestion[] = quiz.questions.map((question) => {
      const selectedIndex = answers[question.index] ?? null
      let correctIndex: number
      let explanation: string
      if (question.questionId) {
        correctIndex = correctIndexByQuestionId.get(question.questionId) ?? 0
        explanation = explanationByQuestionId.get(question.questionId) ?? ""
      } else {
        const poolQuestion = poolByTopic.find((item) => item.question === question.question)
        correctIndex = poolQuestion?.correct_index ?? 0
        explanation = poolQuestion?.explanation ?? ""
      }
      return {
        ...question,
        selectedIndex,
        correctIndex,
        explanation,
        isCorrect: selectedIndex === correctIndex,
      }
    })
    const correctCount = resultQuestions.filter((question) => question.isCorrect).length
    const result: AiQuizResult = {
      score: Math.round((correctCount / Math.max(1, resultQuestions.length)) * 100),
      correctCount,
      questions: resultQuestions,
    }
    const next: AiTopicState = { ...state, quizAnswers: [...answers], quizResult: result }
    persistState(topicId, next)
    return next
  },
  async saveQuizAnswers(topicId, _quizId, answers) {
    const state = demoState(topicId)
    persistState(topicId, { ...state, quizAnswers: [...answers] })
  },
  async sendChat(topicId, _section, message) {
    const quota = currentUsage()
    if (quota.messagesExhausted) throw new Error("Kuota pesan harian habis (30 pesan/hari).")
    const withUser = withMessage(demoState(topicId), "user", message)
    const replyIndex = withUser.messages.length % DEMO_REPLIES.length
    const next = withMessage(withUser, "assistant", DEMO_REPLIES[replyIndex])
    recordUsage(1, 0)
    persistState(topicId, next)
    return next
  },
  async loadQuota() {
    return currentUsage()
  },
}
