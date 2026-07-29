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
  options: [string, string, string, string] | null
  passage?: string
  audioPath?: string
  maxAudioPlays: number
  answerType?: 'multiple_choice' | 'writing' | 'speaking'
  promptHint?: string
  minimumWords?: number
  preparationSeconds?: number
  maxRecordingSeconds?: number
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
  answerText?: string
  audioStoragePath?: string
}

export type ReviewQuestion = PublicQuestion & {
  selectedIndex?: number
  correctIndex?: number
  explanation: string
  answerText?: string
  writingScore?: number
  writingFeedback?: unknown
  speakingScore?: number
  speakingFeedback?: unknown
  audioStoragePath?: string
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
    .select('id, position, section, question, options, passage, audio_path, max_audio_plays, answer_type, prompt_hint, minimum_words, preparation_seconds, max_recording_seconds')
    .eq('exam_version_id', examVersionId)
    .order('position')
  if (error) throw error

  return asRows(data).map((row) => ({
    id: asString(row.id),
    position: asNumber(row.position),
    section: asString(row.section) as Section,
    question: asString(row.question),
    options: row.options ? asOptions(row.options) : null,
    passage: row.passage ? asString(row.passage) : undefined,
    audioPath: row.audio_path ? asString(row.audio_path) : (asString(row.section) === 'listening' ? getAudioPathForPosition(asNumber(row.position)) : undefined),
    maxAudioPlays: asNumber(row.max_audio_plays),
    answerType: asString(row.answer_type || 'multiple_choice') as 'multiple_choice' | 'writing' | 'speaking',
    promptHint: row.prompt_hint ? asString(row.prompt_hint) : undefined,
    minimumWords: row.minimum_words ? asNumber(row.minimum_words) : undefined,
    preparationSeconds: row.preparation_seconds ? asNumber(row.preparation_seconds) : undefined,
    maxRecordingSeconds: row.max_recording_seconds ? asNumber(row.max_recording_seconds) : undefined,
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
    .select('question_id, selected_index, bookmarked, viewed_at, audio_play_count, answer_text, audio_storage_path')
    .eq('attempt_id', attemptId)
  if (error) throw error
  return asRows(data).map((row) => ({
    questionId: asString(row.question_id),
    selectedIndex: row.selected_index === null ? undefined : asNumber(row.selected_index),
    bookmarked: Boolean(row.bookmarked),
    viewedAt: row.viewed_at ? asString(row.viewed_at) : undefined,
    audioPlayCount: asNumber(row.audio_play_count),
    answerText: row.answer_text ? asString(row.answer_text) : undefined,
    audioStoragePath: row.audio_storage_path ? asString(row.audio_storage_path) : undefined,
  }))
}

export async function saveAttemptAnswer(
  client: SupabaseClient,
  attemptId: string,
  questionId: string,
  selectedIndex: number | null | undefined,
  bookmarked: boolean,
  answerText?: string,
  audioStoragePath?: string,
) {
  const { error } = await client.rpc('save_attempt_answer', {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_selected_index: selectedIndex === undefined ? null : selectedIndex,
    p_bookmarked: bookmarked,
    p_mark_viewed: true,
    p_answer_text: answerText || null,
    p_audio_storage_path: audioStoragePath || null,
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
    options: row.options ? asOptions(row.options) : null,
    passage: row.passage ? asString(row.passage) : undefined,
    maxAudioPlays: 2,
    answerType: asString(row.answer_type || 'multiple_choice') as ReviewQuestion['answerType'],
    selectedIndex: row.selected_index === null ? undefined : asNumber(row.selected_index),
    correctIndex: row.correct_index === null || row.correct_index === undefined ? undefined : asNumber(row.correct_index),
    explanation: asString(row.explanation || ''),
    answerText: row.answer_text ? asString(row.answer_text) : undefined,
    writingScore: row.writing_score !== null && row.writing_score !== undefined ? asNumber(row.writing_score) : undefined,
    writingFeedback: row.writing_feedback || undefined,
    speakingScore: row.speaking_score !== null && row.speaking_score !== undefined ? asNumber(row.speaking_score) : undefined,
    speakingFeedback: row.speaking_feedback || undefined,
    audioStoragePath: row.audio_storage_path ? asString(row.audio_storage_path) : undefined,
  }))
}

export async function evaluateWriting(client: SupabaseClient, attemptId: string): Promise<unknown> {
  const { data, error } = await client.functions.invoke('evaluate-writing', {
    body: { attempt_id: attemptId },
  })
  if (error) throw error
  return data
}

export async function evaluateSpeaking(client: SupabaseClient, attemptId: string): Promise<unknown> {
  const { data, error } = await client.functions.invoke('evaluate-speaking', {
    body: { attempt_id: attemptId },
  })
  if (error) throw error
  return data
}

export async function getSignedAudioUrl(client: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await client.storage.from(AUDIO_BUCKET).createSignedUrl(path, 60 * 15)
  if (error) throw error
  return data.signedUrl
}

export function getPublicAudioUrl(client: SupabaseClient, path: string): string {
  return client.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl
}


export type AdminAttempt = CloudAttempt & {
  userId: string
  examTitle: string
}

export async function getAdminAllAttempts(client: SupabaseClient): Promise<AdminAttempt[]> {
  const { data, error } = await client.rpc("get_admin_all_attempts")
  if (error) throw error
  return asRows(data).map((row) => ({
    ...toAttempt(row),
    userId: asString(row.user_id),
    examTitle: asString(row.exam_title),
  }))
}

export async function getAdminAttemptReview(client: SupabaseClient, attemptId: string): Promise<ReviewQuestion[]> {
  const { data, error } = await client.rpc("get_admin_attempt_review", { p_attempt_id: attemptId })
  if (error) throw error
  return asRows(data).map((row) => ({
    id: asString(row.question_id),
    position: asNumber(row.position),
    section: asString(row.section) as Section,
    question: asString(row.question),
    options: row.options ? asOptions(row.options) : null,
    passage: row.passage ? asString(row.passage) : undefined,
    maxAudioPlays: 2,
    answerType: asString(row.answer_type || "multiple_choice") as ReviewQuestion["answerType"],
    selectedIndex: row.selected_index === null ? undefined : asNumber(row.selected_index),
    correctIndex: row.correct_index === null || row.correct_index === undefined ? undefined : asNumber(row.correct_index),
    explanation: asString(row.explanation || ""),
    answerText: row.answer_text ? asString(row.answer_text) : undefined,
    writingScore: row.writing_score !== null && row.writing_score !== undefined ? asNumber(row.writing_score) : undefined,
    writingFeedback: row.writing_feedback || undefined,
    speakingScore: row.speaking_score !== null && row.speaking_score !== undefined ? asNumber(row.speaking_score) : undefined,
    speakingFeedback: row.speaking_feedback || undefined,
    audioStoragePath: row.audio_storage_path ? asString(row.audio_storage_path) : undefined,
  }))
}

export async function adminUpsertQuestion(client: SupabaseClient, questionData: Record<string, unknown>): Promise<string> {
  const { data, error } = await client.rpc("admin_upsert_question", questionData)
  if (error) throw error
  return asString(data)
}


export type AdminQuestion = PublicQuestion & {
  correctIndex: number
  explanation: string
}

export async function getAdminQuestions(client: SupabaseClient, examVersionId: string): Promise<AdminQuestion[]> {
  const { data, error } = await client.rpc("get_admin_questions", { p_exam_version_id: examVersionId })
  if (error) throw error
  return asRows(data).map((row) => ({
    id: asString(row.id),
    position: asNumber(row.position),
    section: asString(row.section) as Section,
    question: asString(row.question),
    options: row.options ? asOptions(row.options) : null,
    passage: row.passage ? asString(row.passage) : undefined,
    audioPath: row.audio_path ? asString(row.audio_path) : undefined,
    maxAudioPlays: 2,
    correctIndex: asNumber(row.correct_index),
    explanation: asString(row.explanation || ""),
  }))
}


export async function seedDemoExamToSupabase(client: SupabaseClient, questions: Array<Record<string, unknown>>): Promise<string> {
  // 1. Create or get package
  let pkgId: string
  const { data: existingPkg } = await client.from("exam_packages").select("id").eq("slug", "hamza-test-full-1").maybeSingle()
  if (existingPkg?.id) {
    pkgId = asString(existingPkg.id)
  } else {
    const { data: newPkg, error: pkgErr } = await client.from("exam_packages").insert({
      slug: "hamza-test-full-1",
      title: "Hamza Test · Simulation (Full Test)",
      subtitle: "Simulasi ujian bahasa Arab 6 seksi · 75 nomor",
      description: "Paket latihan standar Hamza Test dengan timer 60 menit dan analisis 6 seksi.",
    }).select("id").single()
    if (pkgErr) throw pkgErr
    pkgId = asString(newPkg.id)
  }

  // 2. Create or get version
  let versionId: string
  const { data: existingVer } = await client.from("exam_versions").select("id").eq("package_id", pkgId).eq("version_number", 1).maybeSingle()
  if (existingVer?.id) {
    versionId = asString(existingVer.id)
  } else {
    const { data: newVer, error: verErr } = await client.from("exam_versions").insert({
      package_id: pkgId,
      version_number: 1,
      duration_minutes: 60,
      status: "published",
      published_at: new Date().toISOString(),
    }).select("id").single()
    if (verErr) throw verErr
    versionId = asString(newVer.id)
  }

  // 3. Upsert questions in batch or sequence
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    await adminUpsertQuestion(client, {
      p_exam_version_id: versionId,
      p_position: i + 1,
      p_section: asString(q.section),
      p_question: asString(q.question),
      p_options: q.options,
      p_correct_index: asNumber(q.correct_index),
      p_explanation: asString(q.explanation || ""),
      p_passage: q.passage ? asString(q.passage) : null,
      p_audio_path: q.audio_url ? asString(q.audio_url) : null,
    })
  }

  return versionId
}
