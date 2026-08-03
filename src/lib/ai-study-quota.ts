export const AI_STUDY_DAILY_MESSAGES = 30
export const AI_STUDY_DAILY_QUIZZES = 10

export type AiStudyUsage = {
  date: string
  messagesUsed: number
  quizzesUsed: number
}

export type AiStudyQuota = {
  messagesRemaining: number
  quizzesRemaining: number
  messagesExhausted: boolean
  quizzesExhausted: boolean
}

export function dateKeyLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getAiStudyQuota(usage: AiStudyUsage | undefined, now: Date): AiStudyQuota {
  const today = dateKeyLocal(now)
  const current = usage && usage.date === today ? usage : { date: today, messagesUsed: 0, quizzesUsed: 0 }
  const messagesRemaining = Math.max(0, AI_STUDY_DAILY_MESSAGES - current.messagesUsed)
  const quizzesRemaining = Math.max(0, AI_STUDY_DAILY_QUIZZES - current.quizzesUsed)
  return {
    messagesRemaining,
    quizzesRemaining,
    messagesExhausted: messagesRemaining <= 0,
    quizzesExhausted: quizzesRemaining <= 0,
  }
}
