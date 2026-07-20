import type { CefrLevel, ExamFinishReason, ExamSet, Section, SessionResult } from '../types'
import { sections } from '../types'

export const getCefrLevel = (score: number): CefrLevel => {
  if (score >= 80) return 'C1'
  if (score >= 60) return 'B2'
  if (score >= 40) return 'B1'
  return 'A2'
}

export const calculateRemainingSeconds = (endsAt: number | null, now = Date.now()) =>
  endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0

export const createSessionResult = (
  exam: ExamSet,
  answers: Record<string, number>,
  reason: ExamFinishReason,
  completedAt = Date.now(),
): SessionResult => {
  const correctCount = exam.questions.filter((question) => answers[question.id] === question.correct_index).length
  const score = Math.round((correctCount / exam.questions.length) * 100)
  const sectionScores = Object.fromEntries(
    sections.map((section) => {
      const questions = exam.questions.filter((question) => question.section === section)
      const correct = questions.filter((question) => answers[question.id] === question.correct_index).length
      return [section, questions.length ? Math.round((correct / questions.length) * 100) : 0]
    }),
  ) as Record<Section, number>

  return {
    id: `${exam.id}-${completedAt}`,
    examId: exam.id,
    completedAt,
    score,
    correctCount,
    totalQuestions: exam.questions.length,
    cefr: getCefrLevel(score),
    sectionScores,
    reason,
  }
}
