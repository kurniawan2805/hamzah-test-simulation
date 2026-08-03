import type { SupabaseClient } from '@supabase/supabase-js'
import type { Section } from '../types'
import type { AiChatMessage, AiQuiz, AiQuizQuestion, AiQuizResult, AiQuizResultQuestion, AiStudyAdapter, AiTopicState } from './ai-study'
import type { AiStudyQuota } from './ai-study-quota'

const asString = (value: unknown) => (typeof value === 'string' ? value : '')
const asNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0))

function asOptions(value: unknown): [string, string, string, string] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error('Data kuis tidak valid.')
  const options = value.map(String)
  return [options[0] ?? '', options[1] ?? '', options[2] ?? '', options[3] ?? '']
}

function toQuizQuestions(value: unknown): AiQuizQuestion[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const row = item as Record<string, unknown>
    return {
      index,
      question: asString(row.question),
      options: asOptions(row.options),
      passage: typeof row.passage === 'string' && row.passage.length > 0 ? row.passage : undefined,
      questionId: typeof row.question_id === 'string' ? row.question_id : undefined,
    }
  })
}

function toQuizResult(row: Record<string, unknown>): AiQuizResult {
  const rows = Array.isArray(row.questions) ? row.questions : []
  return {
    score: asNumber(row.score),
    correctCount: asNumber(row.correct_count),
    questions: rows.map((item, index): AiQuizResultQuestion => {
      const question = item as Record<string, unknown>
      return {
        index: typeof question.index === 'number' ? question.index : index,
        question: asString(question.question),
        options: asOptions(question.options),
        passage: typeof question.passage === 'string' && question.passage.length > 0 ? question.passage : undefined,
        questionId: typeof question.question_id === 'string' ? question.question_id : undefined,
        selectedIndex: question.selected_index === null || question.selected_index === undefined ? null : asNumber(question.selected_index),
        correctIndex: asNumber(question.correct_index),
        explanation: asString(question.explanation),
        isCorrect: question.is_correct === true,
      }
    }),
  }
}

function rowOf(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return (value[0] ?? {}) as Record<string, unknown>
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return {}
}

function errorMessage(reason: unknown): string {
  if (reason && typeof reason === 'object' && 'message' in reason) return String(reason.message)
  return 'Layanan belajar AI tidak tersedia.'
}

async function ensureSession(client: SupabaseClient, topicId: string, section: Section): Promise<string> {
  const { data, error } = await client.rpc('ai_study_start_session', { p_topic: topicId, p_section: section })
  if (error) throw error
  const sessionId = asString(rowOf(data).session_id)
  if (!sessionId) throw new Error('Sesi belajar gagal dibuat.')
  return sessionId
}

async function invokeAiStudy(client: SupabaseClient, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await client.functions.invoke('ai-study', { body })
  if (error) throw new Error(errorMessage(error))
  return (data ?? {}) as Record<string, unknown>
}

async function loadTopicState(client: SupabaseClient, topicId: string, section: Section): Promise<AiTopicState> {
  const sessionId = await ensureSession(client, topicId, section)

  const { data: messageRows, error: messageError } = await client
    .from('ai_study_messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (messageError) throw messageError

  const messages: AiChatMessage[] = (Array.isArray(messageRows) ? messageRows : []).map((row) => ({
    id: asString(row.id),
    role: asString(row.role) === 'assistant' ? 'assistant' : 'user',
    content: asString(row.content),
    createdAt: Date.parse(asString(row.created_at)) || 0,
  }))

  const { data: quizRows, error: quizError } = await client
    .from('ai_study_quizzes')
    .select('id, topic, questions, answers, completed_at, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (quizError) throw quizError

  const quizRow = Array.isArray(quizRows) ? quizRows[0] : undefined
  let quiz: AiQuiz | null = null
  let quizAnswers: (number | null)[] = []
  let quizResult: AiQuizResult | null = null

  if (quizRow) {
    quiz = {
      id: asString(quizRow.id),
      topicId,
      questions: toQuizQuestions(quizRow.questions),
      createdAt: Date.parse(asString(quizRow.created_at)) || 0,
    }
    quizAnswers = Array.isArray(quizRow.answers)
      ? quizRow.answers.map((value: unknown) => (typeof value === 'number' ? value : null))
      : []
    if (quizRow.completed_at) {
      const { data: gradeRows, error: gradeError } = await client.rpc('ai_study_grade_quiz', {
        p_quiz_id: quiz.id,
        p_answers: quizAnswers.map((value) => (value === null ? null : value)),
      })
      if (!gradeError && gradeRows) quizResult = toQuizResult(rowOf(gradeRows))
    }
  }

  return {
    lessonLoaded: messages.some((message) => message.role === 'assistant'),
    messages,
    quiz,
    quizAnswers,
    quizResult,
  }
}

export function createCloudAiStudyAdapter(client: SupabaseClient): AiStudyAdapter {
  return {
    async loadTopicState(topicId, section) {
      return loadTopicState(client, topicId, section)
    },
    async loadLesson(topicId, section) {
      const sessionId = await ensureSession(client, topicId, section)
      await invokeAiStudy(client, { action: 'lesson', session_id: sessionId, topic: topicId, section })
      return loadTopicState(client, topicId, section)
    },
    async generateQuiz(topicId, section) {
      const sessionId = await ensureSession(client, topicId, section)
      await invokeAiStudy(client, { action: 'quiz_generate', session_id: sessionId, topic: topicId, section })
      return loadTopicState(client, topicId, section)
    },
    async gradeQuiz(topicId, _quizId, answers) {
      await invokeAiStudy(client, { action: 'grade', quiz_id: _quizId, answers: [...answers] })
      return loadTopicState(client, topicId, aiTopicSection(topicId))
    },
    async saveQuizAnswers(topicId, quizId, answers) {
      const section = aiTopicSection(topicId)
      await ensureSession(client, topicId, section)
      const { error } = await client.rpc('ai_study_save_quiz_answers', {
        p_quiz_id: quizId,
        p_answers: answers.map((value) => (value === null ? null : value)),
      })
      if (error) throw error
    },
    async sendChat(topicId, section, message) {
      const sessionId = await ensureSession(client, topicId, section)
      await invokeAiStudy(client, { action: 'chat', session_id: sessionId, message })
      return loadTopicState(client, topicId, section)
    },
    async loadQuota() {
      const { data, error } = await client.rpc('ai_study_usage_remaining')
      if (error) throw error
      const row = rowOf(data)
      const messagesRemaining = Math.max(0, asNumber(row.messages_remaining))
      const quizzesRemaining = Math.max(0, asNumber(row.quizzes_remaining))
      return {
        messagesRemaining,
        quizzesRemaining,
        messagesExhausted: messagesRemaining <= 0,
        quizzesExhausted: quizzesRemaining <= 0,
      } satisfies AiStudyQuota
    },
  }
}

function aiTopicSection(topicId: string): Section {
  return topicId.startsWith('grammar_') ? 'grammar' : 'structures'
}
