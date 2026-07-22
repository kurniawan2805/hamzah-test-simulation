/* eslint-disable react-hooks/purity, react-hooks/set-state-in-effect */

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
  type CloudAnswer,
  type CloudAttempt,
  type PublicQuestion,
  type PublishedExam,
} from './lib/exam-api'
import { AccountMenu } from './lib/auth'
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
  const client = useClient(); const { attemptId } = examRoute.useParams(); const navigate = useNavigate(); const [attempt, setAttempt] = useState<CloudAttempt | null>(null); const [questions, setQuestions] = useState<PublicQuestion[]>([]); const [answers, setAnswers] = useState<Record<string, CloudAnswer>>({}); const [index, setIndex] = useState(0); const [remaining, setRemaining] = useState(0); const [audioUrl, setAudioUrl] = useState<string>(); const completing = useRef(false)
  const load = useCallback(async () => { const current = await getAttempt(client, attemptId); if (current.state !== 'active') { navigate({ to: '/results/$attemptId', params: { attemptId } }); return } const [items, stored] = await Promise.all([getQuestions(client, current.examVersionId), getAttemptAnswers(client, attemptId)]); const remoteAnswers = Object.fromEntries(stored.map((answer) => [answer.questionId, answer])); const backup = useExamStore.getState().cloudBackups[attemptId]; const restoredAnswers = backup ? Object.fromEntries(Object.entries(backup.answers).map(([questionId, value]) => [questionId, { ...remoteAnswers[questionId], ...value, questionId }])) : {}; setAttempt(current); setQuestions(items); setAnswers({ ...remoteAnswers, ...restoredAnswers }); setIndex(backup?.currentIndex ?? 0); if (backup) void Promise.all(Object.entries(backup.answers).map(([questionId, value]) => saveAttemptAnswer(client, attemptId, questionId, value.selectedIndex ?? null, value.bookmarked).catch(() => undefined))); }, [attemptId, client, navigate])
  useEffect(() => { void load().catch(() => navigate({ to: '/' })) }, [load, navigate])
  const finish = useCallback(async () => { if (completing.current) return; completing.current = true; try { await finishAttempt(client, attemptId) } finally { navigate({ to: '/results/$attemptId', params: { attemptId }, replace: true }) } }, [attemptId, client, navigate])
  useEffect(() => { if (!attempt) return; const tick = () => { const seconds = calculateRemainingSeconds(new Date(attempt.endsAt).getTime()); setRemaining(seconds); if (seconds === 0) void finish() }; tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer) }, [attempt, finish])
  const question = questions[index]
  useEffect(() => { if (!question?.audioPath) { setAudioUrl(undefined); return } void getSignedAudioUrl(client, question.audioPath).then(setAudioUrl).catch(() => setAudioUrl(undefined)) }, [client, question?.audioPath])
  if (!attempt || !question) return <main className="grid min-h-dvh place-items-center bg-[#F8FAFC] text-sm font-semibold text-slate-500">Memuat sesi ujian…</main>
  const answer = answers[question.id]; const answeredCount = Object.values(answers).filter((item) => item.selectedIndex !== undefined).length
  const persist = async (selectedIndex: number | undefined, bookmarked = answer?.bookmarked ?? false) => { const next = { questionId: question.id, selectedIndex, bookmarked, viewedAt: answer?.viewedAt ?? new Date().toISOString(), audioPlayCount: answer?.audioPlayCount ?? 0 }; setAnswers((current) => ({ ...current, [question.id]: next })); useExamStore.getState().cacheCloudAnswer(attemptId, question.id, next); try { await saveAttemptAnswer(client, attemptId, question.id, selectedIndex ?? null, bookmarked) } catch { /* The persisted backup is retried after the next reload. */ } }
  const toggleBookmark = async () => { await persist(answer?.selectedIndex, !answer?.bookmarked) }
  const playAudio = async () => { try { await recordAudioPlay(client, attemptId, question.id); const next = { questionId: question.id, selectedIndex: answer?.selectedIndex, bookmarked: answer?.bookmarked ?? false, viewedAt: answer?.viewedAt, audioPlayCount: (answer?.audioPlayCount ?? 0) + 1 }; setAnswers((current) => ({ ...current, [question.id]: next })); useExamStore.getState().cacheCloudAnswer(attemptId, question.id, next); return true } catch { return false } }
  return <main className="min-h-dvh bg-[#F8FAFC] text-slate-900"><header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur"><div className="mx-auto flex h-[60px] max-w-[1440px] items-center gap-3 px-4 sm:px-6"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold uppercase tracking-[0.12em] text-[#006C35]">{sectionCopy[question.section].label}</p><p className="truncate text-sm font-bold">Simulasi Hamza Test</p></div><div className={`flex min-w-[98px] items-center justify-center gap-2 rounded-xl px-3 py-2 font-mono text-sm font-bold tabular-nums ${remaining < 60 ? 'bg-red-50 text-[#DC2626]' : 'bg-[#E6F0EB] text-[#006C35]'}`}><Clock3 size={16} />{formatTime(remaining)}</div><button onClick={() => void finish()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#006C35] px-4 text-sm font-bold text-white active:scale-[0.96]"><Send size={16} /><span className="hidden sm:inline">Kirim</span></button></div><div className="h-1 bg-slate-100"><div className="h-full bg-[#C5A059] transition-[width]" style={{ width: `${(answeredCount / questions.length) * 100}%` }} /></div></header><div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7"><div className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]"><QuestionGrid questions={questions} activeIndex={index} answers={Object.fromEntries(Object.entries(answers).flatMap(([key, value]) => value.selectedIndex === undefined ? [] : [[key, value.selectedIndex]])) as Record<string, number>} bookmarks={Object.values(answers).filter((item) => item.bookmarked).map((item) => item.questionId)} viewedQuestionIds={Object.values(answers).filter((item) => item.viewedAt).map((item) => item.questionId)} onSelect={setIndex} /><section className="min-w-0 rounded-2xl bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]"><div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-[#E6F0EB] text-sm font-bold text-[#006C35]">{question.position}</span><div><p className="text-sm font-bold">Soal {question.position} dari {questions.length}</p><p className="text-xs text-slate-500">{sectionCopy[question.section].description}</p></div></div><button onClick={() => void toggleBookmark()} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold active:scale-[0.96] ${answer?.bookmarked ? 'bg-[#FFF4DE] text-[#B45309]' : 'text-slate-500 hover:bg-slate-100'}`}><Bookmark size={17} className={answer?.bookmarked ? 'fill-current' : ''} />Tandai ragu</button></div><div className={`grid ${question.passage ? 'lg:grid-cols-2' : ''}`}><div className="min-w-0 p-5 sm:p-7">{question.audioPath ? <AudioPlayer questionId={question.id} plays={answer?.audioPlayCount ?? 0} maxPlays={question.maxAudioPlays} audioUrl={audioUrl} onPlay={playAudio} /> : null}<div dir="rtl" className="mt-6 font-arabic"><h1 className="text-[22px] font-medium leading-[1.85] sm:text-[25px]">{question.question}</h1><div className="mt-6 grid gap-3">{question.options.map((option, optionIndex) => { const selected = answer?.selectedIndex === optionIndex; return <button key={option} onClick={() => void persist(optionIndex)} className={`flex min-h-[58px] items-center gap-4 rounded-xl border p-4 text-right text-[18px] leading-[1.8] active:scale-[0.99] ${selected ? 'border-2 border-[#006C35] bg-[#E6F0EB] font-medium text-[#064D2A]' : 'border-slate-200 hover:border-[#006C35]'}`}><span className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${selected ? 'bg-[#006C35] text-white' : 'bg-slate-100 text-slate-600'}`}>{optionLetters[optionIndex]}</span><span>{option}</span></button> })}</div></div></div>{question.passage ? <article dir="rtl" className="order-first max-h-[45dvh] overflow-y-auto border-b border-slate-100 bg-slate-50 p-5 font-arabic sm:p-7 lg:order-none lg:max-h-[calc(100dvh-205px)] lg:border-b-0 lg:border-l"><p className="mb-4 text-sm font-bold text-[#006C35]">النص المقروء</p><p className="text-[22px] leading-[2] text-slate-800 sm:text-[24px]">{question.passage}</p></article> : null}</div><div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-7"><button disabled={index === 0} onClick={() => setIndex(index - 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 disabled:opacity-40"><ChevronLeft size={18} />Sebelumnya</button><button onClick={() => index === questions.length - 1 ? void finish() : setIndex(index + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white active:scale-[0.96]">{index === questions.length - 1 ? 'Kirim' : 'Berikutnya'}<ArrowRight size={18} /></button></div></section></div></div></main>
}

function CloudResultsPage() {
  const client = useClient(); const { attemptId } = resultsRoute.useParams(); const navigate = useNavigate(); const [result, setResult] = useState<CloudAttempt | null>(null)
  useEffect(() => { void getAttempt(client, attemptId).then((attempt) => { if (attempt.state === 'active') navigate({ to: '/exam/$attemptId', params: { attemptId }, replace: true }); else setResult(attempt) }).catch(() => navigate({ to: '/' })) }, [attemptId, client, navigate])
  if (!result) return null; const chartData = Object.entries(result.sectionScores ?? {}).map(([section, score]) => ({ name: sectionCopy[section as Section].label, score }))
  return <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 text-slate-900 sm:px-8 sm:py-12"><div className="mx-auto max-w-5xl"><Brand /><section className="mt-7 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]"><div className="rounded-3xl bg-[#006C35] p-8 text-white shadow-[0_18px_45px_rgba(0,108,53,0.20)]"><span className="grid size-12 place-items-center rounded-2xl bg-white/13"><Check size={25} /></span><p className="mt-6 text-sm font-bold text-emerald-100">Simulasi selesai</p><h1 className="mt-2 text-3xl font-bold">Hasil latihanmu</h1><div className="mt-8 flex items-end gap-4"><span className="text-6xl font-bold tabular-nums">{result.score}</span><span className="mb-2 text-emerald-100">/ 100</span></div><div className="mt-7 flex justify-between rounded-2xl bg-white/10 px-4 py-4"><span className="text-sm text-emerald-50">Level perkiraan</span><span className="rounded-lg bg-[#C5A059] px-3 py-1.5 text-sm font-bold text-[#17321F]">CEFR {result.cefr}</span></div><p className="mt-5 text-sm leading-6 text-emerald-50/85">{result.correctCount} dari {result.totalQuestions} soal dijawab benar.</p></div><section className="rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-8"><p className="text-sm font-bold text-[#006C35]">Analisis kompetensi</p><h2 className="mt-1 text-xl font-bold">Performa per seksi</h2><div className="mt-6 h-64"><Suspense fallback={<div className="h-full rounded-xl bg-slate-100" />}><PerformanceChart data={chartData} /></Suspense></div></section></section><div className="mt-6 flex justify-end"><Link to="/review/$attemptId" params={{ attemptId }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white active:scale-[0.96]"><BookOpenCheck size={17} />Tinjau pembahasan</Link></div></div></main>
}

function CloudReviewPage() {
  const client = useClient(); const { attemptId } = reviewRoute.useParams(); const [questions, setQuestions] = useState<Awaited<ReturnType<typeof getAttemptReview>>>([])
  useEffect(() => { void getAttemptReview(client, attemptId).then(setQuestions).catch(() => setQuestions([])) }, [attemptId, client])
  return <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 text-slate-900 sm:px-8 sm:py-12"><div className="mx-auto max-w-4xl"><Link to="/results/$attemptId" params={{ attemptId }} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft size={17} />Kembali ke hasil</Link><div className="mt-5 rounded-3xl bg-white p-7 shadow-[0_10px_28px_rgba(15,23,42,0.05)]"><p className="text-sm font-bold text-[#006C35]">Mode tinjau</p><h1 className="mt-1 text-3xl font-bold text-balance">Jawaban dan pembahasan</h1></div><div className="mt-6 space-y-5">{questions.map((question) => { const isCorrect = question.selectedIndex === question.correctIndex; return <article key={question.id} className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_22px_rgba(15,23,42,0.04)]"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><span className="text-sm font-bold">Soal {question.position} · {sectionCopy[question.section].label}</span><span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{isCorrect ? 'Benar' : question.selectedIndex === undefined ? 'Tidak dijawab' : 'Perlu ditinjau'}</span></div><div dir="rtl" className="p-5 font-arabic"><h2 className="text-[20px] font-medium leading-[1.85]">{question.question}</h2><div className="mt-5 grid gap-2.5">{question.options.map((option, optionIndex) => <div key={option} className={`flex items-center gap-3 rounded-xl border p-3.5 text-[17px] leading-8 ${optionIndex === question.correctIndex ? 'border-green-200 bg-green-50 text-green-900' : optionIndex === question.selectedIndex ? 'border-red-200 bg-red-50 text-red-900' : 'border-slate-100 text-slate-600'}`}><span className="grid size-7 shrink-0 place-items-center rounded-md bg-white text-xs font-bold shadow-sm">{optionLetters[optionIndex]}</span><span>{option}</span>{optionIndex === question.correctIndex ? <Check className="mr-auto size-4 text-green-700" /> : null}{optionIndex === question.selectedIndex && optionIndex !== question.correctIndex ? <TriangleAlert className="mr-auto size-4 text-red-600" /> : null}</div>)}</div></div><div className="border-t border-slate-100 bg-[#FFFCF4] px-5 py-4 text-sm leading-6 text-slate-700"><span className="font-bold text-[#8A5A12]">Pembahasan: </span>{question.explanation}</div></article> })}</div></div></main>
}

function Brand() { return <Link to="/" className="inline-flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#006C35] text-lg font-bold text-white shadow-sm" dir="rtl">ه</span><span><span className="block text-sm font-bold tracking-tight">Hamza Test</span><span className="block text-xs font-semibold text-slate-500">Simulation</span></span></Link> }
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-2xl bg-white/10 px-4 py-3"><div className="flex items-center gap-2 text-emerald-50/80">{icon}<span className="text-xs font-semibold">{label}</span></div><p className="mt-1.5 text-sm font-bold text-white">{value}</p></div> }
function Instruction({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><span className="text-[#006C35]">{icon}</span><p className="mt-3 text-sm font-bold">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div> }
function formatTime(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
function formatDate(value?: string) { return value ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—' }
