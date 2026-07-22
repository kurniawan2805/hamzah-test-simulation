import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
} from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Bookmark,
  Check,
  ChevronLeft,
  CircleHelp,
  Clock3,
  Mic,
  Headphones,
  History,
  ListChecks,
  PlayCircle,
  Send,
  Save,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioPlayer } from './components/audio-player'
import { QuestionGrid } from './components/question-grid'
import { demoExam } from './data/exam-data'
import { calculateRemainingSeconds, createSessionResult } from './lib/scoring'
import { useExamStore } from './store/exam-store'
import type { ExamFinishReason, Section } from './types'
import { AppAuthProvider, RequireAuth } from './lib/auth'
import { useSupabaseClient } from './lib/supabase'
import { getAudioPath } from './lib/audio-assets'
import { getPublicAudioUrl, getSignedAudioUrl } from './lib/exam-api'
import { CloudApp } from './cloud-app'

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

const rootRoute = createRootRoute({ component: () => <Outlet /> })
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: DashboardPage })
const instructionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/instructions', component: InstructionsPage })
const examRoute = createRoute({ getParentRoute: () => rootRoute, path: '/exam', component: ExamPage })
const resultsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/results', component: ResultsPage })
const reviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/review', component: ReviewPage })
const questionBankRoute = createRoute({ getParentRoute: () => rootRoute, path: '/question-bank', component: QuestionBankPage })

const routeTree = rootRoute.addChildren([dashboardRoute, instructionsRoute, examRoute, resultsRoute, reviewRoute, questionBankRoute])
const router = createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true })

export function App() {
  return <AppAuthProvider><RequireAuth><AppRuntime /></RequireAuth></AppAuthProvider>
}

function AppRuntime() {
  const client = useSupabaseClient()
  const cloudEnabled = import.meta.env.VITE_ENABLE_CLOUD === 'true'
  if (cloudEnabled && client) return <CloudApp client={client} />
  return <RouterProvider router={router} />
}

function DashboardPage() {
  const navigate = useNavigate()
  const history = useExamStore((state) => state.history)
  const activeExamId = useExamStore((state) => state.activeExamId)
  const submittedAt = useExamStore((state) => state.submittedAt)
  const hasActiveSession = activeExamId === demoExam.id && !submittedAt
  const latestScore = history[0]

  return (
    <main className="min-h-dvh bg-[#F8FAFC] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Brand />
          <span className="hidden rounded-full bg-[#E6F0EB] px-3 py-1.5 text-xs font-bold text-[#006C35] sm:inline-flex">CBT mandiri</span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="grid gap-7 rounded-[28px] bg-[#006C35] px-7 py-9 text-white shadow-[0_18px_45px_rgba(0,108,53,0.20)] md:grid-cols-[1.25fr_0.75fr] md:px-10 md:py-11">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-sm font-semibold text-emerald-50">
              <Sparkles size={16} />
              Latihan terarah bahasa Arab
            </div>
            <h1 className="mt-5 max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">Bangun kesiapanmu sebelum mengikuti Hamza Test.</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-emerald-50/85 text-pretty">
              Berlatih dengan ritme ujian: waktu terbatas, navigasi soal, audio berkuota, dan analisis kompetensi.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: hasActiveSession ? '/exam' : '/instructions' })}
              className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#006C35] shadow-sm transition-[transform,box-shadow] active:scale-[0.96]"
            >
              {hasActiveSession ? <TimerReset size={18} /> : <PlayCircle size={18} />}
              {hasActiveSession ? 'Lanjutkan ujian' : 'Mulai simulasi'}
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="grid content-end gap-3 sm:grid-cols-3 md:grid-cols-1">
            <HeroMetric icon={<Clock3 size={19} />} label="Durasi" value={`${demoExam.durationMinutes} menit`} />
            <HeroMetric icon={<ListChecks size={19} />} label="Jumlah soal" value={`${demoExam.questions.length} soal`} />
            <HeroMetric icon={<Headphones size={19} />} label="Audio" value="Maks. 2x" />
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
          <div className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[#006C35]">Paket tersedia</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Pilih format latihan</h2>
              </div>
              <BookOpenCheck className="text-[#C5A059]" size={25} />
            </div>
            <article className="mt-6 rounded-2xl border border-[#E6F0EB] bg-[#FCFFFD] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900">{demoExam.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{demoExam.subtitle}</p>
                </div>
                <span className="rounded-lg bg-[#E6F0EB] px-3 py-1.5 text-xs font-bold text-[#006C35]">Full Test</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2"><Clock3 size={16} /> {demoExam.durationMinutes} menit</span>
                <span className="inline-flex items-center gap-2"><ListChecks size={16} /> 3 bagian · 75 nomor</span>
              </div>
            </article>
          </div>

          <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#FFF7E8] text-[#C5A059]"><History size={20} /></span>
              <div>
                <p className="text-sm font-bold text-slate-900">Riwayat terakhir</p>
                <p className="text-xs text-slate-500">Tersimpan di perangkat ini</p>
              </div>
            </div>
            {latestScore ? (
              <div className="mt-7 flex items-end justify-between">
                <div>
                  <p className="text-4xl font-bold tabular-nums text-[#006C35]">{latestScore.score}</p>
                  <p className="mt-1 text-sm text-slate-500">{formatDate(latestScore.completedAt)}</p>
                </div>
                <span className="rounded-xl bg-[#E6F0EB] px-3 py-2 text-sm font-bold text-[#006C35]">{latestScore.cefr}</span>
              </div>
            ) : (
              <div className="mt-7 rounded-2xl bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">Belum ada hasil. Selesaikan simulasi untuk melihat perkembanganmu.</div>
            )}
          </section>
        </section>
        <button type="button" onClick={() => navigate({ to: '/question-bank' })} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#006C35] bg-white px-4 py-3 text-sm font-bold text-[#006C35] hover:bg-[#E6F0EB]"><BookOpenCheck size={17} />Kelola soal & jawaban</button>
      </div>
    </main>
  )
}

type DraftQuestion = { id: string; section: Section; question: string; options: [string, string, string, string]; correct_index: number; explanation: string }
const questionStorageKey = 'hamza-question-bank-v1'
const emptyQuestion = (): DraftQuestion => ({ id: `draft_${Date.now()}`, section: 'reading', question: '', options: ['', '', '', ''], correct_index: 0, explanation: '' })

function QuestionBankPage() {
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => { try { return JSON.parse(localStorage.getItem(questionStorageKey) ?? '[]') as DraftQuestion[] } catch { return [] } })
  const [draft, setDraft] = useState<DraftQuestion>(() => emptyQuestion())
  const [message, setMessage] = useState('')
  const updateOption = (index: number, value: string) => setDraft((current) => ({ ...current, options: current.options.map((option, i) => i === index ? value : option) as DraftQuestion['options'] }))
  const saveQuestion = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.question.trim() || draft.options.some((option) => !option.trim()) || !draft.explanation.trim()) { setMessage('Lengkapi pertanyaan, 4 opsi, dan pembahasan.'); return }
    const next = [...questions.filter((question) => question.id !== draft.id), draft]
    setQuestions(next); localStorage.setItem(questionStorageKey, JSON.stringify(next)); setDraft(emptyQuestion()); setMessage('Soal tersimpan di perangkat ini.')
  }
  const removeQuestion = (id: string) => { const next = questions.filter((question) => question.id !== id); setQuestions(next); localStorage.setItem(questionStorageKey, JSON.stringify(next)) }
  return <main className="min-h-dvh bg-[#F8FAFC] text-slate-900"><header className="border-b border-slate-200/80 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Brand /><Link to="/" className="text-sm font-bold text-slate-600">Kembali</Link></div></header><div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12"><p className="text-sm font-bold text-[#006C35]">MVP · Modul 1</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Bank soal</h1><p className="mt-3 max-w-2xl leading-7 text-slate-600">Buat soal pilihan ganda dan tentukan satu jawaban benar. Data sementara disimpan di browser.</p><div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><form onSubmit={saveQuestion} className="rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-8"><h2 className="text-xl font-bold">Buat soal baru</h2><label className="mt-6 block text-sm font-bold">Kompetensi<select value={draft.section} onChange={(event) => setDraft({ ...draft, section: event.target.value as Section })} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3"><option value="listening">Istima’ · Listening</option><option value="reading">Qira’ah · Reading</option><option value="grammar">Tarkib · Grammar</option><option value="structures">Tarākīb · Structures</option></select></label><label className="mt-5 block text-sm font-bold">Pertanyaan<textarea dir="rtl" value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} placeholder="Tulis pertanyaan bahasa Arab…" className="font-arabic mt-2 min-h-28 w-full rounded-xl border border-slate-200 p-3 text-lg" /></label><fieldset className="mt-5"><legend className="text-sm font-bold">Opsi jawaban <span className="font-normal text-slate-500">(radio = kunci)</span></legend><div className="mt-2 grid gap-3">{draft.options.map((option, index) => <div key={index} className="flex items-center gap-2"><input type="radio" name="correct" checked={draft.correct_index === index} onChange={() => setDraft({ ...draft, correct_index: index })} className="size-4 accent-[#006C35]" /><input dir="rtl" value={option} onChange={(event) => updateOption(index, event.target.value)} placeholder={`Opsi ${index + 1}`} className="font-arabic min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-lg" /></div>)}</div></fieldset><label className="mt-5 block text-sm font-bold">Pembahasan<textarea value={draft.explanation} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} placeholder="Mengapa jawaban ini benar?" className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3" /></label>{message ? <p className="mt-4 rounded-xl bg-[#FFF7E8] p-3 text-sm font-semibold text-[#8A5A12]">{message}</p> : null}<button type="submit" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-5 py-3 text-sm font-bold text-white"><Save size={17} />Simpan soal</button></form><section className="rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-8"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Soal tersimpan</h2><span className="text-sm font-bold text-slate-500">{questions.length} soal</span></div>{questions.length === 0 ? <p className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm leading-6 text-slate-500">Belum ada soal.</p> : <div className="mt-5 space-y-3">{questions.map((question, index) => <article key={question.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#006C35]">Soal {index + 1} · {question.section}</p><p dir="rtl" className="font-arabic mt-2 text-lg leading-8">{question.question}</p><p className="mt-2 text-xs text-slate-500">Kunci: opsi {question.correct_index + 1}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => { setDraft(question); setMessage('Mode edit aktif.') }} className="rounded-lg px-2 py-1 text-xs font-bold text-[#006C35]">Edit</button><button type="button" onClick={() => removeQuestion(question.id)} aria-label="Hapus soal" className="rounded-lg p-2 text-red-600"><Trash2 size={16} /></button></div></div></article>)}</div>}</section></div></div></main>
}

function InstructionsPage() {
  const navigate = useNavigate()
  const startExam = useExamStore((state) => state.startExam)
  const activeExamId = useExamStore((state) => state.activeExamId)
  const submittedAt = useExamStore((state) => state.submittedAt)
  const resuming = activeExamId === demoExam.id && !submittedAt

  const start = () => {
    if (!resuming) startExam(demoExam.id, demoExam.durationMinutes)
    navigate({ to: '/exam' })
  }

  return (
    <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 transition-colors hover:text-[#006C35]">
          <ArrowLeft size={17} /> Kembali ke dashboard
        </Link>
        <section className="mt-5 rounded-3xl bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_35px_rgba(15,23,42,0.06)] sm:p-9">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#E6F0EB] text-[#006C35]"><ShieldCheck size={24} /></span>
          <p className="mt-6 text-sm font-bold text-[#006C35]">Sebelum memulai</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 text-balance">Petunjuk simulasi ujian</h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-600 text-pretty">Baca petunjuk berikut. Timer mulai saat kamu menekan tombol mulai dan sesi dapat dilanjutkan apabila browser ter-refresh.</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Instruction icon={<Clock3 />} title="Waktu berjalan" text={`Selesaikan ${demoExam.questions.length} soal dalam ${demoExam.durationMinutes} menit.`} />
            <Instruction icon={<Headphones />} title="Cek audio" text="Setiap audio hanya dapat dimulai paling banyak dua kali." />
            <Instruction icon={<Bookmark />} title="Tandai ragu" text="Gunakan ikon bookmark untuk kembali ke soal yang perlu diperiksa." />
            <Instruction icon={<Send />} title="Kirim jawaban" text="Jawaban terkirim otomatis saat waktu habis." />
          </div>

          <div className="mt-8 rounded-2xl border border-amber-100 bg-[#FFF9ED] p-4 text-sm leading-6 text-[#8A5A12]">
            <span className="font-bold">Catatan:</span> ini adalah simulasi latihan. Hasil tersimpan hanya di browser perangkat ini.
          </div>
          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link to="/" className="inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100">Batal</Link>
            <button type="button" onClick={start} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white shadow-sm transition-[transform,background-color] active:scale-[0.96] hover:bg-[#00572B]">
              <PlayCircle size={18} /> {resuming ? 'Lanjutkan simulasi' : 'Saya siap, mulai ujian'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

function ExamPage() {
  const navigate = useNavigate()
  const activeExamId = useExamStore((state) => state.activeExamId)
  const endsAt = useExamStore((state) => state.endsAt)
  const submittedAt = useExamStore((state) => state.submittedAt)
  const currentIndex = useExamStore((state) => state.currentIndex)
  const answers = useExamStore((state) => state.answers)
  const bookmarks = useExamStore((state) => state.bookmarks)
  const viewedQuestionIds = useExamStore((state) => state.viewedQuestionIds)
  const audioPlays = useExamStore((state) => state.audioPlays)
  const setCurrentIndex = useExamStore((state) => state.setCurrentIndex)
  const answerQuestion = useExamStore((state) => state.answerQuestion)
  const toggleBookmark = useExamStore((state) => state.toggleBookmark)
  const markAudioPlay = useExamStore((state) => state.markAudioPlay)
  const completeExam = useExamStore((state) => state.completeExam)
  const [remaining, setRemaining] = useState(() => calculateRemainingSeconds(endsAt))
  const completionRef = useRef(false)
  const safeIndex = Math.min(Math.max(currentIndex, 0), demoExam.questions.length - 1)
  const question = demoExam.questions[safeIndex]
  const answeredCount = Object.keys(answers).length
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({})
  const client = useSupabaseClient()
  const [audioUrl, setAudioUrl] = useState<string>()
  const audioPath = getAudioPath(question.shared_asset_id)

  useEffect(() => {
    if (!client || !audioPath) {
      void Promise.resolve().then(() => setAudioUrl(undefined))
      return
    }
    let cancelled = false
    const audioRequest = import.meta.env.VITE_ENABLE_CLOUD === 'true'
      ? getSignedAudioUrl(client, audioPath)
      : Promise.resolve(getPublicAudioUrl(client, audioPath))
    void audioRequest
      .then((url) => { if (!cancelled) setAudioUrl(url) })
      .catch(() => { if (!cancelled) setAudioUrl(undefined) })
    return () => { cancelled = true }
  }, [audioPath, client])

  const finish = useCallback((reason: ExamFinishReason) => {
    if (completionRef.current || submittedAt) return
    completionRef.current = true
    completeExam(createSessionResult(demoExam, answers, reason))
    navigate({ to: '/results', replace: true })
  }, [answers, completeExam, navigate, submittedAt])

  useEffect(() => {
    if (activeExamId !== demoExam.id) navigate({ to: '/', replace: true })
    if (submittedAt) navigate({ to: '/results', replace: true })
  }, [activeExamId, navigate, submittedAt])

  useEffect(() => {
    const tick = () => {
      const seconds = calculateRemainingSeconds(endsAt)
      setRemaining(seconds)
      if (seconds === 0) finish('timeout')
    }
    tick()
    const interval = window.setInterval(tick, 1_000)
    return () => window.clearInterval(interval)
  }, [endsAt, finish])

  const selectQuestion = (index: number) => {
    setCurrentIndex(index, demoExam.questions[index].id)
  }

  const submit = () => {
    if (window.confirm(`Kirim jawaban sekarang? ${demoExam.questions.length - answeredCount} soal belum dijawab.`)) finish('manual')
  }

  if (activeExamId !== demoExam.id || submittedAt) return null

  return (
    <main className="min-h-dvh bg-[#F8FAFC] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-[0_1px_3px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="mx-auto flex h-[60px] max-w-[1440px] items-center gap-3 px-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold uppercase tracking-[0.12em] text-[#006C35]">{sectionCopy[question.section].label}</p>
            <p className="truncate text-sm font-bold text-slate-800">{demoExam.title}</p>
          </div>
          <div className={`flex min-w-[98px] items-center justify-center gap-2 rounded-xl px-3 py-2 font-mono text-sm font-bold tabular-nums ${remaining < 60 ? 'bg-red-50 text-[#DC2626]' : 'bg-[#E6F0EB] text-[#006C35]'}`}>
            <Clock3 size={16} /> {formatTime(remaining)}
          </div>
          <button type="button" onClick={submit} className="hidden min-h-10 items-center gap-2 rounded-xl bg-[#006C35] px-4 text-sm font-bold text-white transition-[transform,background-color] active:scale-[0.96] hover:bg-[#00572B] sm:inline-flex">
            <Send size={16} /> Kirim
          </button>
          <button type="button" onClick={submit} className="grid size-10 place-items-center rounded-xl bg-[#006C35] text-white transition-[transform,background-color] active:scale-[0.96] hover:bg-[#00572B] sm:hidden" aria-label="Kirim jawaban">
            <Send size={16} />
          </button>
        </div>
        <div className="h-1 bg-slate-100"><div className="h-full bg-[#C5A059] transition-[width]" style={{ width: `${(answeredCount / demoExam.questions.length) * 100}%` }} /></div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7">
        <div className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
          <QuestionGrid
            questions={demoExam.questions}
            activeIndex={safeIndex}
            answers={answers}
            bookmarks={bookmarks}
            viewedQuestionIds={viewedQuestionIds}
            onSelect={selectQuestion}
          />

          <section className="min-w-0 rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-[#E6F0EB] text-sm font-bold text-[#006C35]">{safeIndex + 1}</span>
                <div>
                  <p className="text-sm font-bold text-slate-900">Soal {safeIndex + 1} dari {demoExam.questions.length}</p>
                  <p className="text-xs text-slate-500">{sectionCopy[question.section].description}</p>
                </div>
              </div>
              <button type="button" onClick={() => toggleBookmark(question.id)} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold transition-[transform,background-color,color] active:scale-[0.96] ${bookmarks.includes(question.id) ? 'bg-[#FFF4DE] text-[#B45309]' : 'text-slate-500 hover:bg-slate-100'}`}>
                <Bookmark size={17} className={bookmarks.includes(question.id) ? 'fill-current' : ''} />
                {bookmarks.includes(question.id) ? 'Ditandai' : 'Tandai ragu'}
              </button>
            </div>

            <div className={`grid gap-0 ${question.passage ? 'lg:grid-cols-2' : ''}`}>
              <div className="min-w-0 p-5 sm:p-7">
                {question.section === 'listening' && <div><AudioPlayer questionId={question.shared_asset_id ?? question.id} plays={audioPlays[question.shared_asset_id ?? question.id] ?? 0} audioUrl={audioUrl} onPlay={() => markAudioPlay(question.shared_asset_id ?? question.id)} /><p className="mt-2 text-xs text-slate-500">Aset bersama: {question.shared_asset_id ?? question.id}</p></div>}
                <div dir="rtl" className="mt-6 font-arabic">
                  <h1 className="text-[22px] font-medium leading-[1.85] text-slate-900 sm:text-[25px]">{question.question}</h1>
                  {question.answer_type === 'writing' ? (
                    <div className="mt-6">
                      <p className="mb-3 text-right text-sm text-slate-600">{question.prompt_hint} · minimum {question.minimum_words ?? 80} kata</p>
                      <textarea
                        value={taskDrafts[question.id] ?? ''}
                        onChange={(event) => { setTaskDrafts((drafts) => ({ ...drafts, [question.id]: event.target.value })); answerQuestion(question.id, 0) }}
                        placeholder="اكتب إجابتك هنا..."
                        className="min-h-56 w-full rounded-xl border border-slate-200 bg-white p-4 text-right text-lg leading-9 outline-none focus:border-[#006C35] focus:ring-2 focus:ring-[#E6F0EB]"
                      />
                      <p className="mt-2 text-left text-xs text-slate-500">Prototipe: jawaban esai tersimpan sebagai status selesai, belum dinilai otomatis.</p>
                    </div>
                  ) : question.answer_type === 'speaking' ? (
                    <div className="mt-6 rounded-2xl border border-dashed border-[#C5A059] bg-[#FFFCF4] p-5 text-center" dir="ltr">
                      <Mic className="mx-auto text-[#006C35]" size={30} />
                      <p className="mt-3 font-sans text-sm font-bold text-slate-900">Tugas berbicara · persiapan {question.preparation_seconds ?? 30} detik</p>
                      <p className="mt-1 font-sans text-sm leading-6 text-slate-600">Rekaman hanyalah mockup tampilan dan belum menyimpan audio.</p>
                      <button type="button" onClick={() => answerQuestion(question.id, 0)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-4 text-sm font-bold text-white"><Mic size={17} /> Tandai rekaman selesai</button>
                    </div>
                  ) : <div className="mt-6 grid gap-3">
                    {question.options.map((option, index) => {
                      const selected = answers[question.id] === index
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => answerQuestion(question.id, index)}
                          className={`flex min-h-[58px] w-full items-center gap-4 rounded-xl border p-4 text-right text-[18px] leading-[1.8] transition-[transform,border-color,background-color,box-shadow] active:scale-[0.99] ${selected ? 'border-2 border-[#006C35] bg-[#E6F0EB] font-medium text-[#064D2A] shadow-[0_1px_2px_rgba(0,108,53,0.12)]' : 'border-slate-200 bg-white text-slate-800 hover:border-[#006C35]'}`}
                        >
                          <span className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${selected ? 'bg-[#006C35] text-white' : 'bg-slate-100 text-slate-600'}`}>{optionLetters[index]}</span>
                          <span>{option}</span>
                        </button>
                      )
                    })}
                  </div>}
                </div>
              </div>

              {question.passage && (
                <article dir="rtl" className="order-first max-h-[45dvh] overflow-y-auto border-b border-slate-100 bg-slate-50 p-5 font-arabic sm:p-7 lg:order-none lg:max-h-[calc(100dvh-205px)] lg:border-b-0 lg:border-l">
                  <p className="mb-4 text-sm font-bold text-[#006C35]">النص المقروء</p>
                  <p className="text-[22px] leading-[2] text-slate-800 sm:text-[24px]">{question.passage}</p>
                </article>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-7">
              <button type="button" onClick={() => selectQuestion(safeIndex - 1)} disabled={safeIndex === 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 transition-[transform,background-color,opacity] active:scale-[0.96] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronLeft size={18} /> Sebelumnya
              </button>
              {safeIndex === demoExam.questions.length - 1 ? (
                <button type="button" onClick={submit} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-4 text-sm font-bold text-white transition-[transform,background-color] active:scale-[0.96] hover:bg-[#00572B] sm:hidden">
                  <Send size={16} /> Kirim
                </button>
              ) : (
                <button type="button" onClick={() => selectQuestion(safeIndex + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition-[transform,background-color] active:scale-[0.96] hover:bg-slate-700">
                  Berikutnya <ChevronLeft className="rotate-180" size={18} />
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function ResultsPage() {
  const navigate = useNavigate()
  const submittedAt = useExamStore((state) => state.submittedAt)
  const history = useExamStore((state) => state.history)
  const activeExamId = useExamStore((state) => state.activeExamId)
  const startExam = useExamStore((state) => state.startExam)
  const result = useMemo(() => history.find((entry) => entry.completedAt === submittedAt), [history, submittedAt])

  useEffect(() => {
    if (activeExamId !== demoExam.id || !submittedAt || !result) navigate({ to: '/', replace: true })
  }, [activeExamId, navigate, result, submittedAt])

  if (!result) return null
  const chartData = Object.entries(result.sectionScores).map(([section, score]) => ({ name: sectionCopy[section as Section].label, score }))
  const retry = () => {
    startExam(demoExam.id, demoExam.durationMinutes)
    navigate({ to: '/exam' })
  }

  return (
    <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 text-slate-900 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Brand />
        <section className="mt-7 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-3xl bg-[#006C35] p-8 text-white shadow-[0_18px_45px_rgba(0,108,53,0.20)]">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/13"><Check size={25} /></span>
            <p className="mt-6 text-sm font-bold text-emerald-100">Simulasi selesai</p>
            <h1 className="mt-2 text-3xl font-bold text-balance">Hasil latihanmu</h1>
            <div className="mt-8 flex items-end gap-4">
              <span className="text-6xl font-bold tabular-nums">{result.score}</span>
              <span className="mb-2 text-emerald-100">/ 100</span>
            </div>
            <div className="mt-7 flex items-center justify-between rounded-2xl bg-white/10 px-4 py-4">
              <span className="text-sm text-emerald-50">Level perkiraan</span>
              <span className="rounded-lg bg-[#C5A059] px-3 py-1.5 text-sm font-bold text-[#17321F]">CEFR {result.cefr}</span>
            </div>
            <p className="mt-5 text-sm leading-6 text-emerald-50/85">{result.correctCount} dari {result.totalQuestions} soal objektif dijawab benar{result.reason === 'timeout' ? '; jawaban dikirim saat waktu habis.' : '.'}</p>
            <p className="mt-2 text-xs leading-5 text-emerald-50/75">10 tugas menulis dan berbicara pada prototipe belum masuk nilai otomatis.</p>
          </div>

          <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.06)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[#006C35]">Analisis kompetensi</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Performa per seksi</h2>
              </div>
              <CircleHelp size={21} className="text-slate-400" aria-label="Skor per kompetensi" />
            </div>
            <div className="mt-6 h-64" aria-label="Grafik batang performa per kompetensi">
              <Suspense fallback={<div className="h-full rounded-xl bg-slate-100" aria-label="Memuat grafik" />}>
                <PerformanceChart data={chartData} />
              </Suspense>
            </div>
          </section>
        </section>

        <section className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={retry} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition-[transform,background-color] active:scale-[0.96] hover:bg-slate-50"><TimerReset size={17} /> Ulangi simulasi</button>
          <Link to="/review" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white transition-[transform,background-color] active:scale-[0.96] hover:bg-[#00572B]"><BookOpenCheck size={17} /> Tinjau pembahasan</Link>
        </section>
      </div>
    </main>
  )
}

function ReviewPage() {
  const navigate = useNavigate()
  const activeExamId = useExamStore((state) => state.activeExamId)
  const submittedAt = useExamStore((state) => state.submittedAt)
  const answers = useExamStore((state) => state.answers)

  useEffect(() => {
    if (activeExamId !== demoExam.id || !submittedAt) navigate({ to: '/', replace: true })
  }, [activeExamId, navigate, submittedAt])

  if (activeExamId !== demoExam.id || !submittedAt) return null
  return (
    <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 text-slate-900 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link to="/results" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 transition-colors hover:text-[#006C35]"><ArrowLeft size={17} /> Kembali ke hasil</Link>
        <div className="mt-5 rounded-3xl bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_rgba(15,23,42,0.05)] sm:p-8">
          <p className="text-sm font-bold text-[#006C35]">Mode tinjau</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 text-balance">Jawaban dan pembahasan</h1>
          <p className="mt-3 text-slate-600">Bandingkan jawabanmu dengan kunci lalu gunakan pembahasan untuk memperbaiki strategi.</p>
        </div>
        <div className="mt-6 space-y-5">
          {demoExam.questions.map((question, index) => {
            const answer = answers[question.id]
            const isCorrect = answer === question.correct_index
            return (
              <article key={question.id} className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_22px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-700">{index + 1}</span><SectionPill section={question.section} /></div>
                  <span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{isCorrect ? 'Benar' : answer === undefined ? 'Tidak dijawab' : 'Perlu ditinjau'}</span>
                </div>
                <div dir="rtl" className="p-5 font-arabic sm:p-6">
                  <h2 className="text-[20px] font-medium leading-[1.85] text-slate-900">{question.question}</h2>
                  <div className="mt-5 grid gap-2.5">
                    {question.options.map((option, optionIndex) => {
                      const isAnswer = answer === optionIndex
                      const isKey = question.correct_index === optionIndex
                      return (
                        <div key={option} className={`flex items-center gap-3 rounded-xl border p-3.5 text-[17px] leading-8 ${isKey ? 'border-green-200 bg-green-50 text-green-900' : isAnswer ? 'border-red-200 bg-red-50 text-red-900' : 'border-slate-100 text-slate-600'}`}>
                          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white text-xs font-bold shadow-sm">{optionLetters[optionIndex]}</span>
                          <span>{option}</span>
                          {isKey && <Check className="mr-auto size-4 text-green-700" />}
                          {isAnswer && !isKey && <TriangleAlert className="mr-auto size-4 text-red-600" />}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="border-t border-slate-100 bg-[#FFFCF4] px-5 py-4 text-sm leading-6 text-slate-700 sm:px-6"><span className="font-bold text-[#8A5A12]">Pembahasan: </span>{question.explanation.replace(/^Pembahasan:\s*/i, '')}</div>
              </article>
            )
          })}
        </div>
      </div>
    </main>
  )
}

function Brand() {
  return (
    <Link to="/" className="inline-flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-xl bg-[#006C35] text-lg font-bold text-white shadow-sm" dir="rtl">ه</span>
      <span><span className="block text-sm font-bold tracking-tight text-slate-900">Hamza Test</span><span className="block text-xs font-semibold text-slate-500">Simulation</span></span>
    </Link>
  )
}

function HeroMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm"><div className="flex items-center gap-2 text-emerald-50/80">{icon}<span className="text-xs font-semibold">{label}</span></div><p className="mt-1.5 text-sm font-bold text-white">{value}</p></div>
}

function Instruction({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><span className="text-[#006C35]">{icon}</span><p className="mt-3 text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div>
}

function SectionPill({ section }: { section: Section }) {
  return <span className="rounded-md bg-[#E6F0EB] px-2.5 py-1 text-xs font-bold text-[#006C35]">{sectionCopy[section].label}</span>
}

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(timestamp)
}
