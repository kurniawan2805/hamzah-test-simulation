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
  _writingAnswers?: Record<string, string>,
  writingGrades: Record<string, { score: number; feedback: unknown }> = {},
  speakingGrades: Record<string, { score: number; feedback: unknown }> = {},
): SessionResult => {
  const scoredQuestions = exam.questions.filter((question) => question.scored !== false)
  
  // Calculate correct MCQ and add writing/speaking points
  const mcqQuestions = scoredQuestions.filter((q) => q.answer_type !== 'writing' && q.answer_type !== 'speaking')
  const correctMcqCount = mcqQuestions.filter((question) => answers[question.id] === question.correct_index).length
  
  const writingQuestions = scoredQuestions.filter((q) => q.answer_type === 'writing')
  const writingTotalScore = writingQuestions.reduce((acc, q) => acc + (writingGrades[q.id]?.score ?? 0), 0)

  const speakingQuestions = scoredQuestions.filter((q) => q.answer_type === 'speaking')
  const speakingTotalScore = speakingQuestions.reduce((acc, q) => acc + (speakingGrades[q.id]?.score ?? 0), 0)
  
  // Weighted / direct average score
  // Each MCQ is worth 1 point. Each writing/speaking is worth (score / 100) points.
  const totalScoreVal = correctMcqCount + (writingTotalScore / 100) + (speakingTotalScore / 100)
  const score = scoredQuestions.length ? Math.round((totalScoreVal / scoredQuestions.length) * 100) : 0
  const correctCount = Math.round(totalScoreVal)

  const sectionScores = Object.fromEntries(
    sections.map((section) => {
      const questions = scoredQuestions.filter((question) => question.section === section)
      if (!questions.length) return [section, 0]

      if (section === 'writing') {
        const avgWriting = Math.round(writingTotalScore / questions.length)
        return [section, avgWriting]
      }

      if (section === 'speaking') {
        const avgSpeaking = Math.round(speakingTotalScore / questions.length)
        return [section, avgSpeaking]
      }

      const correct = questions.filter((question) => answers[question.id] === question.correct_index).length
      return [section, Math.round((correct / questions.length) * 100)]
    }),
  ) as Record<Section, number>

  return {
    id: `${exam.id}-${completedAt}`,
    examId: exam.id,
    completedAt,
    score,
    correctCount,
    totalQuestions: scoredQuestions.length,
    cefr: getCefrLevel(score),
    sectionScores,
    reason,
  }
}
