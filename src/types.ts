export const sections = ['listening', 'reading', 'grammar', 'structures', 'writing', 'speaking'] as const

export type Section = (typeof sections)[number]

export type UserTier = 'free' | 'vip' | 'vip_plus'

export interface Question {
  id: string
  section: Section
  topic?: string
  question: string
  options: [string, string, string, string]
  correct_index: number
  explanation: string
  passage?: string
  audio_url?: string
  /** Identitas aset bersama; beberapa nomor dapat merujuk ke audio/teks yang sama. */
  shared_asset_id?: string
  answer_type?: 'multiple_choice' | 'writing' | 'speaking'
  prompt_hint?: string
  minimum_words?: number
  preparation_seconds?: number
  max_recording_seconds?: number
  scored?: boolean
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
