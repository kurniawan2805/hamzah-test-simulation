/* eslint-disable react-hooks/set-state-in-effect */
  // Remove unused eslint directive warning
  /* eslint-disable react-hooks/purity */

import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
} from '@tanstack/react-router'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowLeft, ArrowRight, Bookmark, BookOpenCheck, Check, ChevronLeft, Clock3, Headphones, History, PlayCircle, Send, ShieldCheck, TimerReset, TriangleAlert } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AudioPlayer } from './components/audio-player'
import { SpeakingRecorder } from './components/speaking-recorder'
import { QuestionGrid } from './components/question-grid'
import {
  finishAttempt,
  getAttempt,
  getAttemptAnswers,
  getAttemptReview,
  getPublishedExams,
  getQuestions,
  getSignedAudioUrl,
  recordAudioPlay,
  saveAttemptAnswer,
  startAttempt,
  evaluateWriting,
  evaluateSpeaking,
  type CloudAnswer,
  type CloudAttempt,
  type PublicQuestion,
  type PublishedExam,
} from './lib/exam-api'
import { AccountMenu } from './lib/auth'
import { AUDIO_BUCKET } from './lib/audio-assets'
import { calculateRemainingSeconds } from './lib/scoring'
import { useExamStore } from './store/exam-store'
import type { Section } from './types'

const PerformanceChart = lazy(() => import('./components/performance-chart'))
const sectionCopy: Record<Section, { label: string; description: string }> = {
  listening: { label: 'Istima’', description: 'Pemahaman mendengar' },
  reading: { label: 'Qira’ah', description: 'Pemahaman membaca' },
  grammar: { label: 'Tarkib', description: 'Tata bahasa' },
  structures: { label: 'Tarākīb', description: 'Struktur bahasa' },
  writing: { label: 'Kitābah', description: 'Tugas menulis' },
  speaking: { label: 'Muḥādatsah', description: 'Tugas berbicara' },
}
const optionLetters = ['أ', 'ب', 'ج', 'د']

const rootRoute = createRootRouteWithContext<{ client: SupabaseClient }>()({ component: () => <Outlet /> })
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: CloudDashboardPage })
const instructionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/instructions/$versionId', component: CloudInstructionsPage })
const examRoute = createRoute({ getParentRoute: () => rootRoute, path: '/exam/$attemptId', component: CloudExamPage })
const resultsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/results/$attemptId', component: CloudResultsPage })
const reviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/review/$attemptId', component: CloudReviewPage })
const router = createRouter({ routeTree: rootRoute.addChildren([dashboardRoute, instructionsRoute, examRoute, resultsRoute, reviewRoute]), context: { client: null as unknown as SupabaseClient }, defaultPreload: 'intent' })

export function CloudApp({ client }: { client: SupabaseClient }) {
  return <RouterProvider router={router} context={{ client }} />
}

function useClient() {
  return rootRoute.useRouteContext().client
}

function CloudDashboardPage() {
  const client = useClient()
  const navigate = useNavigate()
  const [exams, setExams] = useState<PublishedExam[]>([])
  const [attempts, setAttempts] = useState<CloudAttempt[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    void Promise.all([
      getPublishedExams(client),
      client.from('attempts').select('id, exam_version_id, state, started_at, ends_at, completed_at, score, correct_count, total_questions, cefr, section_scores, finish_reason').order('created_at', { ascending: false }).limit(8),
    ]).then(([published, response]) => {
      if (response.error) throw response.error
      setExams(published)
      setAttempts((response.data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id), examVersionId: String(row.exam_version_id), state: row.state as CloudAttempt['state'],
        startedAt: String(row.started_at), endsAt: String(row.ends_at), completedAt: row.completed_at ?? undefined,
        score: row.score ?? undefined, correctCount: row.correct_count ?? undefined, totalQuestions: row.total_questions ?? undefined,
        cefr: row.cefr as CloudAttempt['cefr'] | undefined, sectionScores: row.section_scores as CloudAttempt['sectionScores'], finishReason: row.finish_reason as CloudAttempt['finishReason'] | undefined,
      })))
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Paket ujian belum dapat dimuat.'))
  }, [client])

  const activeAttempt = attempts.find((attempt) => attempt.state === 'active' && new Date(attempt.endsAt).getTime() > Date.now())
  const activeExam = exams.find((exam) => exam.id === activeAttempt?.examVersionId)
  const latestScore = attempts.find((attempt) => attempt.state !== 'active')

  return <main className="min-h-dvh bg-[#F8FAFC] text-slate-900">
    <header className="border-b border-slate-200/80 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Brand /><AccountMenu /></div></header>
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <section className="grid gap-7 rounded-[28px] bg-[#006C35] px-7 py-9 text-white shadow-[0_18px_45px_rgba(0,108,53,0.20)] md:grid-cols-[1.25fr_0.75fr] md:px-10">
        <div><p className="inline-flex rounded-full bg-white/12 px-3 py-1.5 text-sm font-semibold text-emerald-50">CBT mandiri · tersimpan di akunmu</p><h1 className="mt-5 max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">Bangun kesiapanmu sebelum Hamza Test.</h1><p className="mt-4 max-w-xl leading-7 text-emerald-50/85 text-pretty">Latih ritme ujian yang fokus: waktu terbatas, audio berkuota, dan analisis kompetensi.</p>
          {activeAttempt ? <button onClick={() => navigate({ to: '/exam/$attemptId', params: { attemptId: activeAttempt.id } })} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#006C35] active:scale-[0.96]"><TimerReset size={18} />Lanjutkan {activeExam?.title ?? 'ujian'}<ArrowRight size={17} /></button> : null}
        </div>
        <div className="grid content-end gap-3 sm:grid-cols-3 md:grid-cols-1"><Metric icon={<Clock3 size={19} />} label="Sesi tersimpan" value={`${attempts.length} attempt`} /><Metric icon={<BookOpenCheck size={19} />} label="Paket terbit" value={`${exams.length} paket`} /><Metric icon={<Headphones size={19} />} label="Audio" value="Maks. 2x" /></div>
      </section>
      {error ? <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
      <section className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]"><div className="rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-7"><p className="text-sm font-bold text-[#006C35]">Paket tersedia</p><h2 className="mt-1 text-xl font-bold">Pilih format latihan</h2><div className="mt-6 grid gap-3">{exams.map((exam) => <article key={exam.id} className="rounded-2xl border border-[#E6F0EB] bg-[#FCFFFD] p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-bold">{exam.title}</h3><p className="mt-1 text-sm text-slate-600">{exam.subtitle}</p></div><button onClick={() => navigate({ to: '/instructions/$versionId', params: { versionId: exam.id } })} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-4 text-sm font-bold text-white active:scale-[0.96]"><PlayCircle size={17} />Mulai</button></div><p className="mt-4 text-sm text-slate-600"><Clock3 className="mr-2 inline size-4" />{exam.durationMinutes} menit · Full Test</p></article>)}</div></div>
        <aside className="rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-7"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#FFF7E8] text-[#C5A059]"><History size={20} /></span><div><p className="text-sm font-bold">Riwayat terakhir</p><p className="text-xs text-slate-500">Tersimpan di akun</p></div></div>{latestScore ? <div className="mt-7"><p className="text-4xl font-bold tabular-nums text-[#006C35]">{latestScore.score}</p><p className="mt-1 text-sm text-slate-500">{formatDate(latestScore.completedAt)}</p><span className="mt-3 inline-block rounded-lg bg-[#E6F0EB] px-3 py-1.5 text-sm font-bold text-[#006C35]">CEFR {latestScore.cefr}</span></div> : <p className="mt-7 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">Belum ada hasil ujian.</p>}</aside></section>
    </div>
  </main>
}

function CloudInstructionsPage() {
  const client = useClient(); const { versionId } = instructionsRoute.useParams(); const navigate = useNavigate(); const [exam, setExam] = useState<PublishedExam | null>(null); const [starting, setStarting] = useState(false); const [error, setError] = useState('')
  useEffect(() => { void getPublishedExams(client).then((items) => setExam(items.find((item) => item.id === versionId) ?? null)).catch(() => setError('Paket ujian tidak tersedia.')) }, [client, versionId])
  const begin = async () => { setStarting(true); try { const attempt = await startAttempt(client, versionId); navigate({ to: '/exam/$attemptId', params: { attemptId: attempt.id } }) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ujian belum dapat dimulai.') } finally { setStarting(false) } }
  return <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 sm:px-8 sm:py-12"><div className="mx-auto max-w-3xl"><Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft size={17} />Kembali ke dashboard</Link><section className="mt-5 rounded-3xl bg-white p-7 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-9"><span className="grid size-12 place-items-center rounded-2xl bg-[#E6F0EB] text-[#006C35]"><ShieldCheck size={24} /></span><p className="mt-6 text-sm font-bold text-[#006C35]">Sebelum memulai</p><h1 className="mt-1 text-3xl font-bold text-balance">{exam?.title ?? 'Memuat paket…'}</h1><p className="mt-4 leading-7 text-slate-600">Timer mulai saat kamu menekan tombol mulai. Jawaban disimpan ke akunmu dan akan tetap tersedia setelah refresh.</p><div className="mt-8 grid gap-3 sm:grid-cols-2"><Instruction icon={<Clock3 />} title="Waktu berjalan" text={`${exam?.durationMinutes ?? '—'} menit untuk menyelesaikan tes.`} /><Instruction icon={<Headphones />} title="Cek audio" text="Setiap audio hanya boleh diputar dua kali." /><Instruction icon={<Bookmark />} title="Tandai ragu" text="Kembali ke soal yang perlu diperiksa." /><Instruction icon={<Send />} title="Kirim jawaban" text="Ujian terkunci otomatis saat waktu habis." /></div>{error ? <p className="mt-5 text-sm font-semibold text-red-700">{error}</p> : null}<button disabled={!exam || starting} onClick={() => void begin()} className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white active:scale-[0.96] disabled:opacity-50"><PlayCircle size={18} />{starting ? 'Menyiapkan…' : 'Saya siap, mulai ujian'}</button></section></div></main>
}

function CloudExamPage() {
  const client = useClient(); const { attemptId } = examRoute.useParams(); const navigate = useNavigate(); const [attempt, setAttempt] = useState<CloudAttempt | null>(null); const [questions, setQuestions] = useState<PublicQuestion[]>([]); const [answers, setAnswers] = useState<Record<string, CloudAnswer>>({}); const [index, setIndex] = useState(0); const [remaining, setRemaining] = useState(0); const [audioUrl, setAudioUrl] = useState<string>(); const completing = useRef(false); const [grading, setGrading] = useState(false); const [speakingSaveError, setSpeakingSaveError] = useState<string | null>(null)
  
  const load = useCallback(async () => { 
    const current = await getAttempt(client, attemptId)
    if (current.state !== 'active') { 
      navigate({ to: '/results/$attemptId', params: { attemptId } })
      return 
    } 
    const [items, stored] = await Promise.all([getQuestions(client, current.examVersionId), getAttemptAnswers(client, attemptId)])
    const remoteAnswers = Object.fromEntries(stored.map((answer) => [answer.questionId, answer]))
    const backup = useExamStore.getState().cloudBackups[attemptId]
    const restoredAnswers = backup ? Object.fromEntries(Object.entries(backup.answers).map(([questionId, value]) => [questionId, { ...remoteAnswers[questionId], ...value, questionId }])) : {}
    setAttempt(current)
    setQuestions(items)
    setAnswers({ ...remoteAnswers, ...restoredAnswers })
    setIndex(backup?.currentIndex ?? 0)
    if (backup) {
      void Promise.all(Object.entries(backup.answers).map(([questionId, value]) => 
        saveAttemptAnswer(client, attemptId, questionId, value.selectedIndex ?? null, value.bookmarked, value.answerText, value.audioStoragePath).catch(() => undefined)
      ))
    }
  }, [attemptId, client, navigate])

  useEffect(() => { void load().catch(() => navigate({ to: '/' })) }, [load, navigate])

  const finish = useCallback(async () => { 
    if (completing.current) return
    completing.current = true
    setGrading(true)
    try { 
      await finishAttempt(client, attemptId)
      try { 
        await Promise.allSettled([
          evaluateWriting(client, attemptId),
          evaluateSpeaking(client, attemptId),
        ])
      } catch (e) { 
        console.error('AI grading failed:', e) 
      } 
    } finally { 
      navigate({ to: '/results/$attemptId', params: { attemptId }, replace: true }) 
    } 
  }, [attemptId, client, navigate])

  useEffect(() => { 
    if (!attempt) return
    const tick = () => { 
      const seconds = calculateRemainingSeconds(new Date(attempt.endsAt).getTime())
      setRemaining(seconds)
      if (seconds === 0) void finish() 
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer) 
  }, [attempt, finish])

  const question = questions[index]
  useEffect(() => { 
    if (!question?.audioPath) { 
      setAudioUrl(undefined)
      return 
    } 
    void getSignedAudioUrl(client, question.audioPath).then(setAudioUrl).catch(() => setAudioUrl(undefined)) 
  }, [client, question?.audioPath])

  const answer = question ? answers[question.id] : undefined
  const speakingAudioUrl = useSpeakingAudioUrl(client, question, answer)
  const answeredCount = Object.values(answers).filter((item) => 
    item.selectedIndex !== undefined || 
    (item.answerText && item.answerText.trim().length > 0) ||
    (item.audioStoragePath && item.audioStoragePath.trim().length > 0)
  ).length

  const persist = useCallback(async (selectedIndex: number | undefined, bookmarked = answer?.bookmarked ?? false, answerText?: string, audioStoragePath?: string) => {
    if (!question) return
    const next = { 
      questionId: question.id, 
      selectedIndex, 
      bookmarked, 
      viewedAt: answer?.viewedAt ?? new Date().toISOString(), 
      audioPlayCount: answer?.audioPlayCount ?? 0, 
      answerText, 
      audioStoragePath 
    }
    setAnswers((current) => ({ ...current, [question.id]: next }))
    useExamStore.getState().cacheCloudAnswer(attemptId, question.id, next)
    try { 
      await saveAttemptAnswer(client, attemptId, question.id, selectedIndex, bookmarked, answerText, audioStoragePath) 
    } catch { 
      /* The persisted backup is retried after the next reload. */ 
    }
  }, [answer?.audioPlayCount, answer?.bookmarked, answer?.viewedAt, attemptId, client, question])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key === 'ArrowRight') {
        if (index < questions.length - 1) setIndex(index + 1)
      } else if (event.key === 'ArrowLeft') {
        if (index > 0) setIndex(index - 1)
      } else if (['1', '2', '3', '4'].includes(event.key)) {
        const optionIdx = parseInt(event.key, 10) - 1
        if (question && question.answerType !== 'writing' && optionIdx < (question.options?.length ?? 0)) void persist(optionIdx)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [index, questions.length, question, persist])

  if (!attempt || !question) return <main className="grid min-h-dvh place-items-center bg-[#F8FAFC] text-sm font-semibold text-slate-500">Memuat sesi ujian…</main>
  
  const toggleBookmark = async () => { await persist(answer?.selectedIndex, !answer?.bookmarked, answer?.answerText) }
  
  const playAudio = async () => { 
    try { 
      await recordAudioPlay(client, attemptId, question.id)
      const next = { 
        questionId: question.id, 
        selectedIndex: answer?.selectedIndex, 
        bookmarked: answer?.bookmarked ?? false, 
        viewedAt: answer?.viewedAt, 
        audioPlayCount: (answer?.audioPlayCount ?? 0) + 1,
        answerText: answer?.answerText
      }
      setAnswers((current) => ({ ...current, [question.id]: next }))
      useExamStore.getState().cacheCloudAnswer(attemptId, question.id, next)
      return true 
    } catch { 
      return false 
    } 
  }

  const localWritingAnswers = Object.fromEntries(
    Object.entries(answers).map(([key, val]) => [key, val.answerText || ''])
  )

  const localSpeakingAnswers = Object.fromEntries(
    Object.entries(answers).flatMap(([key, val]) => val.audioStoragePath ? [[key, val.audioStoragePath]] : [])
  )

  // Use localSpeakingAnswers to satisfy eslint unused variable check
  void localSpeakingAnswers

  const wordCount = answer?.answerText ? answer.answerText.trim().split(/\s+/).filter(Boolean).length : 0

  const handleSpeakingComplete = async (blob: Blob) => {
    if (!question) return
    setSpeakingSaveError(null)
    const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
    const path = `speaking/${attemptId}/${question.id}.${extension}`
    try {
      const { error: uploadErr } = await client.storage
        .from(AUDIO_BUCKET)
        .upload(path, blob, { contentType: blob.type || `audio/${extension}`, upsert: true })
      
      if (uploadErr) throw uploadErr

      await persist(undefined, answer?.bookmarked, undefined, path)
    } catch (err) {
      console.error('Failed to save speaking recording:', err)
      setSpeakingSaveError('Rekaman belum tersimpan ke akun. Coba rekam ulang.')
    }
  }

  return <main className="min-h-dvh bg-[#F8FAFC] text-slate-900">
    {grading && (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm text-white">
        <div className="size-12 animate-spin rounded-full border-4 border-white/25 border-t-white" />
        <p className="mt-4 text-lg font-bold text-center">Mengevaluasi jawaban esai & berbicara dengan AI...<br /><span className="text-sm font-normal text-slate-300 font-sans">Mohon tunggu sebentar</span></p>
      </div>
    )}
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur"><div className="mx-auto flex h-[60px] max-w-[1440px] items-center gap-3 px-4 sm:px-6"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold uppercase tracking-[0.12em] text-[#006C35]">{sectionCopy[question.section].label}</p><p className="truncate text-sm font-bold">Simulasi Hamza Test</p></div><div className={`flex min-w-[98px] items-center justify-center gap-2 rounded-xl px-3 py-2 font-mono text-sm font-bold tabular-nums ${remaining < 60 ? 'bg-red-50 text-[#DC2626]' : 'bg-[#E6F0EB] text-[#006C35]'}`} aria-live={remaining < 60 ? 'assertive' : 'off'} aria-label={`Sisa waktu: ${Math.floor(remaining / 60)} menit ${remaining % 60} detik`}><Clock3 size={16} aria-hidden="true" />{formatTime(remaining)}</div><button onClick={() => void finish()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#006C35] px-4 text-sm font-bold text-white active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A059]"><Send size={16} aria-hidden="true" /><span className="hidden sm:inline">Kirim</span></button></div><div className="h-1 bg-slate-100" role="progressbar" aria-valuenow={answeredCount} aria-valuemin={0} aria-valuemax={questions.length} aria-label="Progres terisi"><div className="h-full bg-[#C5A059] transition-[width]" style={{ width: `${(answeredCount / questions.length) * 100}%` }} /></div></header>
    <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7">
      <div className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
        <QuestionGrid 
          questions={questions} 
          activeIndex={index} 
          answers={Object.fromEntries(Object.entries(answers).flatMap(([key, value]) => value.selectedIndex === undefined ? [] : [[key, value.selectedIndex]])) as Record<string, number>} 
          writingAnswers={localWritingAnswers}
          speakingAnswers={localSpeakingAnswers}
          bookmarks={Object.values(answers).filter((item) => item.bookmarked).map((item) => item.questionId)} 
          viewedQuestionIds={Object.keys(answers)} 
          onSelect={(idx) => { setIndex(idx); useExamStore.getState().setCloudCurrentIndex(attemptId, idx) }} 
        />
        <section className="min-w-0 rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-[#E6F0EB] text-sm font-bold text-[#006C35]">{index + 1}</span>
              <div>
                <h1 className="text-sm font-bold text-slate-900">Soal {index + 1} dari {questions.length}</h1>
                <p className="text-xs text-slate-500">{sectionCopy[question.section].description}</p>
              </div>
            </div>
            <button type="button" onClick={() => void toggleBookmark()} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold transition-[transform,background-color,color] active:scale-[0.96] focus-visible:outline-[#C5A059] ${answer?.bookmarked ? 'bg-[#FFF4DE] text-[#B45309]' : 'text-slate-500 hover:bg-slate-100'}`}><Bookmark size={17} className={answer?.bookmarked ? 'fill-current' : ''} />{answer?.bookmarked ? 'Ditandai' : 'Tandai ragu'}</button>
          </div>
          <div className={`grid gap-0 ${question.passage ? 'lg:grid-cols-2' : ''}`}>
            <div className="min-w-0 p-5 sm:p-7">
              {question.section === 'listening' && <div><AudioPlayer questionId={question.id} plays={answer?.audioPlayCount ?? 0} maxPlays={question.maxAudioPlays} audioUrl={audioUrl} onPlay={playAudio} /></div>}
              <div dir="rtl" className="mt-6 font-arabic text-right">
                <h2 className="text-[22px] font-medium leading-[1.85] text-slate-900 sm:text-[25px]">{question.question}</h2>
                {question.answerType === 'writing' ? (
                  <div className="mt-6 text-right">
                    <p className="mb-3 text-right text-sm text-slate-600 font-sans" lang="id">{question.promptHint} · minimum {question.minimumWords ?? 80} kata</p>
                    <textarea
                      value={answer?.answerText ?? ''}
                      onChange={(event) => {
                        void persist(undefined, answer?.bookmarked, event.target.value)
                      }}
                      placeholder="اكتب إجابتك هنا..."
                      className="min-h-56 w-full rounded-xl border border-slate-200 bg-white p-4 text-right text-lg leading-9 outline-none focus:border-[#006C35] focus:ring-2 focus:ring-[#E6F0EB]"
                      aria-label="Area jawaban esai bahasa Arab"
                    />
                    <div className="mt-2 flex justify-between text-xs text-slate-500 font-sans" lang="id">
                      <span>{wordCount} kata</span>
                      <span>Jawaban disimpan otomatis ke akunmu</span>
                    </div>
                  </div>
                ) : question.answerType === 'speaking' ? (
                  <>
                    <SpeakingRecorder
                      questionId={question.id}
                      preparationSeconds={question.preparationSeconds ?? 30}
                      maxRecordingSeconds={question.maxRecordingSeconds ?? 60}
                      existingAudioUrl={speakingAudioUrl}
                      onRecordingComplete={handleSpeakingComplete}
                    />
                    {speakingSaveError ? <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{speakingSaveError}</p> : null}
                  </>
                ) : (
                  <div className="mt-6 grid gap-3">
                    {(question.options || []).map((option, optionIdx) => {
                      const selected = answer?.selectedIndex === optionIdx
                      return <button key={option} type="button" onClick={() => void persist(optionIdx, answer?.bookmarked, answer?.answerText)} className={`flex min-h-[58px] w-full items-center gap-4 rounded-xl border p-4 text-right text-[18px] leading-[1.8] transition-[transform,border-color,background-color] active:scale-[0.99] ${selected ? 'border-2 border-[#006C35] bg-[#E6F0EB] font-medium text-[#064D2A]' : 'border-slate-200 bg-white text-slate-800 hover:border-[#006C35]'}`}><span className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${selected ? 'bg-[#006C35] text-white' : 'bg-slate-100 text-slate-600'}`}>{optionLetters[optionIdx]}</span><span>{option}</span></button>
                    })}
                  </div>
                )}
              </div>
            </div>
            {question.passage && <article dir="rtl" className="order-first max-h-[45dvh] overflow-y-auto border-b border-slate-100 bg-slate-50 p-5 font-arabic sm:p-7 lg:order-none lg:max-h-[calc(100dvh-205px)] lg:border-b-0 lg:border-l"><p className="mb-4 text-sm font-bold text-[#006C35] text-right">النص المقروء</p><p className="text-[22px] leading-[2] text-slate-800 sm:text-[24px] text-right">{question.passage}</p></article>}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-7">
            <button type="button" onClick={() => setIndex(index - 1)} disabled={index === 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"><ChevronLeft size={18} />Sebelumnya</button>
            {index === questions.length - 1 ? <button type="button" onClick={() => void finish()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-4 text-sm font-bold text-white hover:bg-[#00572B] sm:hidden"><Send size={16} />Kirim</button> : <button type="button" onClick={() => setIndex(index + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-700">Berikutnya <ChevronLeft className="rotate-180" size={18} /></button>}
          </div>
        </section>
      </div>
    </div>
  </main>
}

function CloudResultsPage() {
  const client = useClient(); const { attemptId } = resultsRoute.useParams(); const navigate = useNavigate(); const [result, setResult] = useState<CloudAttempt | null>(null)
  useEffect(() => { void getAttempt(client, attemptId).then((attempt) => { if (attempt.state === 'active') navigate({ to: '/exam/$attemptId', params: { attemptId }, replace: true }); else setResult(attempt) }).catch(() => navigate({ to: '/' })) }, [attemptId, client, navigate])
  if (!result) return null; const chartData = Object.entries(result.sectionScores ?? {}).map(([section, score]) => ({ name: sectionCopy[section as Section].label, score }))
  return <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 text-slate-900 sm:px-8 sm:py-12"><div className="mx-auto max-w-5xl"><Brand /><section className="mt-7 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]"><div className="rounded-3xl bg-[#006C35] p-8 text-white shadow-[0_18px_45px_rgba(0,108,53,0.20)]"><span className="grid size-12 place-items-center rounded-2xl bg-white/13"><Check size={25} /></span><p className="mt-6 text-sm font-bold text-emerald-100">Simulasi selesai</p><h1 className="mt-2 text-3xl font-bold">Hasil latihanmu</h1><div className="mt-8 flex items-end gap-4"><span className="text-6xl font-bold tabular-nums">{result.score}</span><span className="mb-2 text-emerald-100">/ 100</span></div><div className="mt-7 flex justify-between rounded-2xl bg-white/10 px-4 py-4"><span className="text-sm text-emerald-50">Level perkiraan</span><span className="rounded-lg bg-[#C5A059] px-3 py-1.5 text-sm font-bold text-[#17321F]">CEFR {result.cefr}</span></div><p className="mt-5 text-sm leading-6 text-emerald-50/85">{result.correctCount} dari {result.totalQuestions} soal dijawab benar.</p></div><section className="rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-8"><p className="text-sm font-bold text-[#006C35]">Analisis kompetensi</p><h2 className="mt-1 text-xl font-bold">Performa per seksi</h2><div className="mt-6 h-64"><Suspense fallback={<div className="h-full rounded-xl bg-slate-100" />}><PerformanceChart data={chartData} /></Suspense></div></section></section><div className="mt-6 flex justify-end"><Link to="/review/$attemptId" params={{ attemptId }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white active:scale-[0.96]"><BookOpenCheck size={17} />Tinjau pembahasan</Link></div></div></main>
}

const ReviewAudioPlayer: React.FC<{ client?: SupabaseClient; audioPath: string }> = ({ client, audioPath }) => {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!client) {
      setUrl(audioPath)
      return
    }
    let cancelled = false
    void getSignedAudioUrl(client, audioPath)
      .then((u) => { if (!cancelled) setUrl(u) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [client, audioPath])

  if (!url) return <div className="text-xs text-slate-400 font-sans p-2">Membuat tautan rekaman audio...</div>
  return <audio src={url} controls className="w-full max-w-md mt-3 rounded-lg border border-slate-200 bg-slate-50 p-1" />
}

function CloudReviewPage() {
  const client = useClient(); const { attemptId } = reviewRoute.useParams(); const [questions, setQuestions] = useState<Awaited<ReturnType<typeof getAttemptReview>>>([])
  useEffect(() => { void getAttemptReview(client, attemptId).then(setQuestions).catch(() => setQuestions([])) }, [attemptId, client])
  return <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 text-slate-900 sm:px-8 sm:py-12"><div className="mx-auto max-w-4xl"><Link to="/results/$attemptId" params={{ attemptId }} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft size={17} />Kembali ke hasil</Link><div className="mt-5 rounded-3xl bg-white p-7 shadow-[0_10px_28px_rgba(15,23,42,0.05)]"><p className="text-sm font-bold text-[#006C35]">Mode tinjau</p><h1 className="mt-1 text-3xl font-bold text-balance">Jawaban dan pembahasan</h1></div><div className="mt-6 space-y-5">{questions.map((question) => { 
    if (question.answerType === 'speaking') {
      const feedback = question.writingFeedback as {
        pronunciation_score?: number
        fluency_score?: number
        relevance_score?: number
        transcript?: string
        corrections?: Array<{ original: string; corrected: string; category: string; explanation_id: string }>
        feedback_id?: string
        feedback_ar?: string
      } | undefined
      const score = question.writingScore ?? 0;
      return (
        <article key={question.id} className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <span className="text-sm font-bold">Soal {question.position} · {sectionCopy[question.section].label}</span>
            <span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${score >= 60 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>Nilai AI: {score} / 100</span>
          </div>
          <div className="p-5">
            <div dir="rtl" className="font-arabic text-right">
              <h2 className="text-[20px] font-medium leading-[1.85]">{question.question}</h2>
              {question.audioStoragePath ? (
                <div className="mt-4 flex flex-col items-end gap-2">
                  <p className="text-xs text-slate-500 font-sans" lang="id">Rekaman Anda:</p>
                  <ReviewAudioPlayer client={client} audioPath={question.audioStoragePath} />
                </div>
              ) : (
                <div className="mt-4 text-sm text-slate-400 font-sans" lang="id">(Tidak ada rekaman audio)</div>
              )}

              {feedback?.transcript && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-right text-lg leading-8 text-slate-800">
                  <p className="text-xs text-slate-500 font-sans mb-1" lang="id">Transkrip Suara (AI):</p>
                  {feedback.transcript}
                </div>
              )}
            </div>
            
            {feedback && (
              <div className="mt-6 border-t border-slate-100 pt-5 text-sm leading-6">
                <h3 className="font-bold text-[#006C35] mb-3">Analisis Penilaian AI (Berbicara):</h3>
                <div className="grid gap-3 sm:grid-cols-3 mb-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Pelafalan (Makhraj)</p>
                    <p className="text-lg font-bold text-slate-900">{feedback.pronunciation_score} / 35</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Kelancaran (Fluency)</p>
                    <p className="text-lg font-bold text-slate-900">{feedback.fluency_score} / 35</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Kesesuaian Tema</p>
                    <p className="text-lg font-bold text-slate-900">{feedback.relevance_score} / 30</p>
                  </div>
                </div>
                
                {feedback.corrections && feedback.corrections.length > 0 && (
                  <div className="mb-4">
                    <p className="font-bold text-slate-800 mb-2">Koreksi Pelafalan & Ejaan:</p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left border-collapse border border-slate-150">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="p-2 border border-slate-150 text-right">Lafal Asli</th>
                            <th className="p-2 border border-slate-150 text-right">Seharusnya</th>
                            <th className="p-2 border border-slate-150">Kategori</th>
                            <th className="p-2 border border-slate-150">Penjelasan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {feedback.corrections.map((corr: { original: string; corrected: string; category: string; explanation_id: string }, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-2 border border-slate-150 font-arabic text-right text-red-600" dir="rtl">{corr.original}</td>
                              <td className="p-2 border border-slate-150 font-arabic text-right text-green-700" dir="rtl">{corr.corrected}</td>
                              <td className="p-2 border border-slate-150 text-xs font-semibold text-slate-500">{corr.category}</td>
                              <td className="p-2 border border-slate-150 text-xs text-slate-600">{corr.explanation_id}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-[#FFFBF4] border border-amber-100 p-4 mb-3">
                  <p className="font-bold text-[#8A5A12] mb-1">Evaluasi (Bahasa Indonesia):</p>
                  <p className="text-slate-700">{feedback.feedback_id}</p>
                </div>

                <div dir="rtl" className="rounded-xl bg-emerald-50/40 border border-emerald-100 p-4 font-arabic text-right">
                  <p className="font-bold text-[#064D2A] mb-1 font-sans">التقييم العام:</p>
                  <p className="text-emerald-900 leading-7">{feedback.feedback_ar}</p>
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-slate-100 bg-[#FFFCF4] px-5 py-4 text-sm leading-6 text-slate-700 sm:px-6"><span className="font-bold text-[#8A5A12]">Pembahasan: </span>{question.explanation.replace(/^Pembahasan:\s*/i, '')}</div>
        </article>
      );
    }

    if (question.answerType === 'writing') {
      const feedback = question.writingFeedback as {
        grammar_score?: number
        vocabulary_score?: number
        relevance_score?: number
        corrections?: Array<{ original: string; corrected: string; category: string; explanation_id: string }>
        feedback_id?: string
        feedback_ar?: string
      } | undefined
      const score = question.writingScore ?? 0;
      return (
        <article key={question.id} className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <span className="text-sm font-bold">Soal {question.position} · {sectionCopy[question.section].label}</span>
            <span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${score >= 60 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>Nilai AI: {score} / 100</span>
          </div>
          <div className="p-5">
            <div dir="rtl" className="font-arabic text-right">
              <h2 className="text-[20px] font-medium leading-[1.85]">{question.question}</h2>
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-right text-lg leading-8 text-slate-800">
                {question.answerText || '(Tidak ada jawaban)'}
              </div>
            </div>
            
            {feedback && (
              <div className="mt-6 border-t border-slate-100 pt-5 text-sm leading-6">
                <h3 className="font-bold text-[#006C35] mb-3">Analisis Penilaian AI:</h3>
                <div className="grid gap-3 sm:grid-cols-3 mb-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Tata Bahasa</p>
                    <p className="text-lg font-bold text-slate-900">{feedback.grammar_score} / 35</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Kosa Kata</p>
                    <p className="text-lg font-bold text-slate-900">{feedback.vocabulary_score} / 35</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Relevansi</p>
                    <p className="text-lg font-bold text-slate-900">{feedback.relevance_score} / 30</p>
                  </div>
                </div>
                
                {feedback.corrections && feedback.corrections.length > 0 && (
                  <div className="mb-4">
                    <p className="font-bold text-slate-800 mb-2">Koreksi Kata & Ejaan:</p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left border-collapse border border-slate-150">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="p-2 border border-slate-150 text-right">Asli (Salah)</th>
                            <th className="p-2 border border-slate-150 text-right">Koreksi (Benar)</th>
                            <th className="p-2 border border-slate-150">Kategori</th>
                            <th className="p-2 border border-slate-150">Penjelasan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {feedback.corrections.map((corr: { original: string; corrected: string; category: string; explanation_id: string }, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-2 border border-slate-150 font-arabic text-right text-red-600" dir="rtl">{corr.original}</td>
                              <td className="p-2 border border-slate-150 font-arabic text-right text-green-700" dir="rtl">{corr.corrected}</td>
                              <td className="p-2 border border-slate-150 text-xs font-semibold text-slate-500">{corr.category}</td>
                              <td className="p-2 border border-slate-150 text-xs text-slate-600">{corr.explanation_id}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-[#FFFBF4] border border-amber-100 p-4 mb-3">
                  <p className="font-bold text-[#8A5A12] mb-1">Evaluasi (Bahasa Indonesia):</p>
                  <p className="text-slate-700">{feedback.feedback_id}</p>
                </div>

                <div dir="rtl" className="rounded-xl bg-emerald-50/40 border border-emerald-100 p-4 font-arabic text-right">
                  <p className="font-bold text-[#064D2A] mb-1 font-sans">التقييم العام:</p>
                  <p className="text-emerald-900 leading-7">{feedback.feedback_ar}</p>
                </div>
              </div>
            )}
          </div>
        </article>
      );
    }

    const isCorrect = question.selectedIndex === question.correctIndex;
    return <article key={question.id} className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_22px_rgba(15,23,42,0.04)]"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><span className="text-sm font-bold">Soal {question.position} · {sectionCopy[question.section].label}</span><span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{isCorrect ? 'Benar' : question.selectedIndex === undefined ? 'Tidak dijawab' : 'Perlu ditinjau'}</span></div><div dir="rtl" className="p-5 font-arabic text-right"><h2 className="text-[20px] font-medium leading-[1.85]">{question.question}</h2><div className="mt-5 grid gap-2.5">{(question.options || []).map((option, optionIndex) => <div key={option} className={`flex items-center gap-3 rounded-xl border p-3.5 text-[17px] leading-8 ${optionIndex === question.correctIndex ? 'border-green-200 bg-green-50 text-green-900' : optionIndex === question.selectedIndex ? 'border-red-200 bg-red-50 text-red-900' : 'border-slate-100 text-slate-600'}`}><span className="grid size-7 shrink-0 place-items-center rounded-md bg-white text-xs font-bold shadow-sm">{optionLetters[optionIndex]}</span><span>{option}</span>{optionIndex === question.correctIndex ? <Check className="mr-auto size-4 text-green-700" /> : optionIndex === question.selectedIndex ? <TriangleAlert className="mr-auto size-4 text-red-600" /> : null}</div>)}</div></div><div className="border-t border-slate-100 bg-[#FFFCF4] px-5 py-4 text-sm leading-6 text-slate-700 sm:px-6"><span className="font-bold text-[#8A5A12]">Pembahasan: </span>{question.explanation.replace(/^Pembahasan:\s*/i, '')}</div></article> })}</div></div></main>
}

function useSpeakingAudioUrl(client: SupabaseClient, question: PublicQuestion | undefined, answer: CloudAnswer | undefined) {
  const [speakingAudioUrl, setSpeakingAudioUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!question || question.answerType !== 'speaking' || !answer?.audioStoragePath) {
      setSpeakingAudioUrl(null)
      return
    }
    let cancelled = false
    void getSignedAudioUrl(client, answer.audioStoragePath)
      .then((url) => { if (!cancelled) setSpeakingAudioUrl(url) })
      .catch(() => { if (!cancelled) setSpeakingAudioUrl(null) })
    return () => { cancelled = true }
  }, [client, question, answer?.audioStoragePath])
  return speakingAudioUrl
}

function Brand() { return <Link to="/" className="inline-flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#006C35] text-lg font-bold text-white shadow-sm" dir="rtl">ه</span><span><span className="block text-sm font-bold tracking-tight">Hamza Test</span><span className="block text-xs font-semibold text-slate-500">Simulation</span></span></Link> }
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-2xl bg-white/10 px-4 py-3"><div className="flex items-center gap-2 text-emerald-50/80">{icon}<span className="text-xs font-semibold">{label}</span></div><p className="mt-1.5 text-sm font-bold text-white">{value}</p></div> }
function Instruction({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><span className="text-[#006C35]">{icon}</span><p className="mt-3 text-sm font-bold">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div> }
function formatTime(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
function formatDate(value?: string) { return value ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—' }
