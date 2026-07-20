export const sections = ['listening', 'reading', 'grammar', 'dictation'] as const

export type Section = (typeof sections)[number]

export interface Question {
  id: string
  section: Section
  question: string
  options: [string, string, string, string]
  correct_index: number
  explanation: string
  passage?: string
  audio_url?: string
}

export interface ExamSet {
  id: string
  title: string
  subtitle: string
  durationMinutes: number
  questions: Question[]
}

export type ExamFinishReason = 'manual' | 'timeout'

export interface SessionResult {
  id: string
  examId: string
  completedAt: number
  score: number
  correctCount: number
  totalQuestions: number
  cefr: CefrLevel
  sectionScores: Record<Section, number>
  reason: ExamFinishReason
}

export type CefrLevel = 'A2' | 'B1' | 'B2' | 'C1'
