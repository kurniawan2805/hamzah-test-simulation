import type { SupabaseClient } from '@supabase/supabase-js'
import type { Section } from '../types'
import { AUDIO_BUCKET, getAudioPathForPosition } from './audio-assets'

export type PublishedExam = {
  id: string
  packageId: string
  title: string
  subtitle: string
  durationMinutes: number
}

export type PublicQuestion = {
  id: string
  position: number
  section: Section
  question: string
  options: [string, string, string, string]
  passage?: string
  audioPath?: string
  maxAudioPlays: number
}

export type CloudAttempt = {
  id: string
  examVersionId: string
  state: 'active' | 'submitted' | 'timed_out'
  startedAt: string
  endsAt: string
  completedAt?: string
  score?: number
  correctCount?: number
  totalQuestions?: number
  cefr?: 'A2' | 'B1' | 'B2' | 'C1'
  sectionScores?: Record<Section, number>
  finishReason?: 'manual' | 'timeout'
}

export type CloudAnswer = {
  questionId: string
  selectedIndex?: number
  bookmarked: boolean
  viewedAt?: string
  audioPlayCount: number
}

export type ReviewQuestion = PublicQuestion & {
  selectedIndex?: number
  correctIndex: number
  explanation: string
}

type Row = Record<string, unknown>

const asRow = (value: unknown): Row => value as Row
const asRows = (value: unknown): Row[] => (Array.isArray(value) ? value : []) as Row[]
const asString = (value: unknown) => (typeof value === 'string' ? value : '')
const asNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0))
const asOptions = (value: unknown) => (Array.isArray(value) ? value.map(String).slice(0, 4) : []) as [string, string, string, string]

function toAttempt(row: Row): CloudAttempt {
  return {
    id: asString(row.attempt_id || row.id),
    examVersionId: asString(row.exam_version_id),
    state: asString(row.state) as CloudAttempt['state'],
    startedAt: asString(row.started_at),
    endsAt: asString(row.ends_at),
    completedAt: row.completed_at ? asString(row.completed_at) : undefined,
    score: row.score === null || row.score === undefined ? undefined : asNumber(row.score),
    correctCount: row.correct_count === null || row.correct_count === undefined ? undefined : asNumber(row.correct_count),
    totalQuestions: row.total_questions === null || row.total_questions === undefined ? undefined : asNumber(row.total_questions),
    cefr: row.cefr ? asString(row.cefr) as CloudAttempt['cefr'] : undefined,
    sectionScores: (row.section_scores ?? undefined) as CloudAttempt['sectionScores'],
    finishReason: row.finish_reason ? asString(row.finish_reason) as CloudAttempt['finishReason'] : undefined,
  }
}

export async function getPublishedExams(client: SupabaseClient): Promise<PublishedExam[]> {
  const { data, error } = await client
    .from('exam_versions')
    .select('id, duration_minutes, package:exam_packages(id, title, subtitle)')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (error) throw error

  return asRows(data).map((row) => {
    const packageRow = asRow(Array.isArray(row.package) ? row.package[0] : row.package)
    return {
      id: asString(row.id),
      packageId: asString(packageRow.id),
      title: asString(packageRow.title),
      subtitle: asString(packageRow.subtitle),
      durationMinutes: asNumber(row.duration_minutes),
    }
  })
}

export async function getQuestions(client: SupabaseClient, examVersionId: string): Promise<PublicQuestion[]> {
  const { data, error } = await client
    .from('exam_questions')
    .select('id, position, section, question, options, passage, audio_path, max_audio_plays')
    .eq('exam_version_id', examVersionId)
    .order('position')
  if (error) throw error

  return asRows(data).map((row) => ({
    id: asString(row.id),
    position: asNumber(row.position),
    section: asString(row.section) as Section,
    question: asString(row.question),
    options: asOptions(row.options),
    passage: row.passage ? asString(row.passage) : undefined,
    audioPath: row.audio_path ? asString(row.audio_path) : (asString(row.section) === 'listening' ? getAudioPathForPosition(asNumber(row.position)) : undefined),
    maxAudioPlays: asNumber(row.max_audio_plays),
  }))
}

export async function startAttempt(client: SupabaseClient, examVersionId: string): Promise<CloudAttempt> {
  const { data, error } = await client.rpc('start_attempt', { p_exam_version_id: examVersionId })
  if (error) throw error
  return toAttempt(asRows(data)[0])
}

export async function getAttempt(client: SupabaseClient, attemptId: string): Promise<CloudAttempt> {
  const { data, error } = await client
    .from('attempts')
    .select('id, exam_version_id, state, started_at, ends_at, completed_at, score, correct_count, total_questions, cefr, section_scores, finish_reason')
    .eq('id', attemptId)
    .single()
  if (error) throw error
  return toAttempt(asRow(data))
}

export async function getAttemptAnswers(client: SupabaseClient, attemptId: string): Promise<CloudAnswer[]> {
  const { data, error } = await client
    .from('attempt_answers')
    .select('question_id, selected_index, bookmarked, viewed_at, audio_play_count')
    .eq('attempt_id', attemptId)
  if (error) throw error
  return asRows(data).map((row) => ({
    questionId: asString(row.question_id),
    selectedIndex: row.selected_index === null ? undefined : asNumber(row.selected_index),
    bookmarked: Boolean(row.bookmarked),
    viewedAt: row.viewed_at ? asString(row.viewed_at) : undefined,
    audioPlayCount: asNumber(row.audio_play_count),
  }))
}

export async function saveAttemptAnswer(client: SupabaseClient, attemptId: string, questionId: string, selectedIndex: number | null, bookmarked: boolean) {
  const { error } = await client.rpc('save_attempt_answer', {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_selected_index: selectedIndex,
    p_bookmarked: bookmarked,
  })
  if (error) throw error
}

export async function recordAudioPlay(client: SupabaseClient, attemptId: string, questionId: string): Promise<number> {
  const { data, error } = await client.rpc('record_audio_play', { p_attempt_id: attemptId, p_question_id: questionId })
  if (error) throw error
  return asNumber(data)
}

export async function finishAttempt(client: SupabaseClient, attemptId: string): Promise<CloudAttempt> {
  const { data, error } = await client.rpc('finish_attempt', { p_attempt_id: attemptId })
  if (error) throw error
  return toAttempt(asRows(data)[0])
}

export async function getAttemptReview(client: SupabaseClient, attemptId: string): Promise<ReviewQuestion[]> {
  const { data, error } = await client.rpc('get_attempt_review', { p_attempt_id: attemptId })
  if (error) throw error
  return asRows(data).map((row) => ({
    id: asString(row.question_id),
    position: asNumber(row.position),
    section: asString(row.section) as Section,
    question: asString(row.question),
    options: asOptions(row.options),
    passage: row.passage ? asString(row.passage) : undefined,
    maxAudioPlays: 2,
    selectedIndex: row.selected_index === null ? undefined : asNumber(row.selected_index),
    correctIndex: asNumber(row.correct_index),
    explanation: asString(row.explanation),
  }))
}

export async function getSignedAudioUrl(client: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await client.storage.from(AUDIO_BUCKET).createSignedUrl(path, 60 * 15)
  if (error) throw error
  return data.signedUrl
}

export function getPublicAudioUrl(client: SupabaseClient, path: string): string {
  return client.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl
}
