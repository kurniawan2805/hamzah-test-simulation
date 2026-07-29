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
import { ArrowLeft, ArrowRight, Bookmark, BookOpenCheck, Check, ChevronLeft, Clock3, Grid, Headphones, History, PlayCircle, Save, Search, Send, ShieldCheck, Sparkles, TimerReset, TriangleAlert, User, Users, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AudioPlayer } from './components/audio-player'
import { SpeakingRecorder } from './components/speaking-recorder'
import { QuestionGrid } from './components/question-grid'
import { demoExam } from './data/exam-data'
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
  type ReviewQuestion,
  getAdminAllAttempts,
  getAdminAttemptReview,
  adminUpsertQuestion,
  type AdminAttempt,
  type AdminQuestion,
  getAdminQuestions,
  seedDemoExamToSupabase,
} from './lib/exam-api'
import { AccountMenu, useAppAuth } from './lib/auth'
import { AUDIO_BUCKET } from './lib/audio-assets'
import { calculateRemainingSeconds } from './lib/scoring'
import { posthog } from './lib/posthog'
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
  const auth = useAppAuth()
  const isAdmin = auth.role === "admin"

  const [exams, setExams] = useState<PublishedExam[]>([])
  const [attempts, setAttempts] = useState<CloudAttempt[]>([])
  const [adminAttempts, setAdminAttempts] = useState<AdminAttempt[]>([])
  const [adminQuestions, setAdminQuestions] = useState<AdminQuestion[]>([])
  const [error, setError] = useState("")

  const [activeTab, setActiveTab] = useState<"packages" | "my_history" | "all_history" | "user_mgmt" | "question_bank">("packages")
  const [searchTerm, setSearchTerm] = useState("")
  const [inspectAttemptId, setInspectAttemptId] = useState<string | null>(null)
  const [inspectQuestions, setInspectQuestions] = useState<ReviewQuestion[]>([])

  // Admin Question Editor state
  const [selectedVersionId, setSelectedVersionId] = useState<string>("")
  const [selectedPos, setSelectedPos] = useState<number>(1)
  const [saving, setSaving] = useState<boolean>(false)
  const [seeding, setSeeding] = useState<boolean>(false)
  const [formMsg, setFormMsg] = useState<string>("")
  const [successNotice, setSuccessNotice] = useState<string>("")

  const [draft, setDraft] = useState({
    id: undefined as string | undefined,
    examVersionId: "",
    position: 1,
    section: "reading" as Section,
    question: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    explanation: "",
    passage: "",
    audioPath: "",
  })

  const loadExamsAndAttempts = useCallback(async () => {
    try {
      const [published, response] = await Promise.all([
        getPublishedExams(client),
        client.from("attempts").select("id, exam_version_id, state, started_at, ends_at, completed_at, score, correct_count, total_questions, cefr, section_scores, finish_reason").order("created_at", { ascending: false }).limit(20),
      ])
      if (response.error) throw response.error
      setExams(published)
      if (published.length > 0 && !selectedVersionId) {
        setSelectedVersionId(published[0].id)
      }
      setAttempts((response.data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id), examVersionId: String(row.exam_version_id), state: row.state as CloudAttempt["state"],
        startedAt: String(row.started_at), endsAt: String(row.ends_at), completedAt: row.completed_at ?? undefined,
        score: row.score ?? undefined, correctCount: row.correct_count ?? undefined, totalQuestions: row.total_questions ?? undefined,
        cefr: row.cefr as CloudAttempt["cefr"] | undefined, sectionScores: row.section_scores as CloudAttempt["sectionScores"], finishReason: row.finish_reason as CloudAttempt["finishReason"] | undefined,
      })))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Paket ujian belum dapat dimuat.")
    }
  }, [client, selectedVersionId])

  useEffect(() => {
    void loadExamsAndAttempts()
  }, [loadExamsAndAttempts])

  useEffect(() => {
    if (isAdmin) {
      void getAdminAllAttempts(client).then(setAdminAttempts).catch(() => {})
    }
  }, [client, isAdmin])

  // Load questions when selected package changes or tab becomes question_bank
  useEffect(() => {
    if (isAdmin && selectedVersionId) {
      void getAdminQuestions(client, selectedVersionId)
        .then((qs) => {
          setAdminQuestions(qs)
          if (qs.length > 0) {
            const first = qs[0]
            setSelectedPos(first.position)
            setDraft({
              id: first.id,
              examVersionId: selectedVersionId,
              position: first.position,
              section: first.section,
              question: first.question,
              options: first.options ? [...first.options] : ["", "", "", ""],
              correctIndex: first.correctIndex ?? 0,
              explanation: first.explanation || "",
              passage: first.passage || "",
              audioPath: first.audioPath || "",
            })
          } else {
            setSelectedPos(1)
            setDraft({
              id: undefined,
              examVersionId: selectedVersionId,
              position: 1,
              section: "reading",
              question: "",
              options: ["", "", "", ""],
              correctIndex: 0,
              explanation: "",
              passage: "",
              audioPath: "",
            })
          }
        })
        .catch(() => setAdminQuestions([]))
    }
  }, [client, isAdmin, selectedVersionId])

  useEffect(() => {
    if (inspectAttemptId) {
      const fetchReview = isAdmin ? getAdminAttemptReview(client, inspectAttemptId) : getAttemptReview(client, inspectAttemptId)
      void fetchReview.then(setInspectQuestions).catch(() => setInspectQuestions([]))
    }
  }, [client, inspectAttemptId, isAdmin])

  const activeAttempt = attempts.find((attempt) => attempt.state === "active" && new Date(attempt.endsAt).getTime() > Date.now())
  const activeExam = exams.find((exam) => exam.id === activeAttempt?.examVersionId)
  const completedAttempts = attempts.filter((a) => a.state !== "active")
  const latestScore = completedAttempts[0]

  const totalSessions = completedAttempts.length
  const avgScore = totalSessions > 0 ? Math.round(completedAttempts.reduce((acc, a) => acc + (a.score || 0), 0) / totalSessions) : 0
  const maxScore = totalSessions > 0 ? Math.max(...completedAttempts.map((a) => a.score || 0)) : 0

  const filteredMyHistory = completedAttempts.filter((a) => {
    const dateStr = formatDate(a.completedAt).toLowerCase()
    return dateStr.includes(searchTerm.toLowerCase()) || String(a.score || "").includes(searchTerm)
  })

  const filteredAllAttempts = adminAttempts.filter((a) => {
    const term = searchTerm.toLowerCase()
    return a.userId.toLowerCase().includes(term) || a.examTitle.toLowerCase().includes(term) || String(a.score || "").includes(term)
  })

  // Handle auto-population when selecting a question position
  const handleSelectQuestionPosition = (pos: number) => {
    setSelectedPos(pos)
    setFormMsg("")
    setSuccessNotice("")
    const existing = adminQuestions.find((q) => q.position === pos)
    if (existing) {
      setDraft({
        id: existing.id,
        examVersionId: selectedVersionId,
        position: existing.position,
        section: existing.section,
        question: existing.question,
        options: existing.options ? [...existing.options] : ["", "", "", ""],
        correctIndex: existing.correctIndex ?? 0,
        explanation: existing.explanation || "",
        passage: existing.passage || "",
        audioPath: existing.audioPath || "",
      })
    } else {
      setDraft({
        id: undefined,
        examVersionId: selectedVersionId,
        position: pos,
        section: "reading",
        question: "",
        options: ["", "", "", ""],
        correctIndex: 0,
        explanation: "",
        passage: "",
        audioPath: "",
      })
    }
  }

  // Handle seeding default 75 questions into Supabase Cloud
  const handleSeedCloudData = async () => {
    setSeeding(true)
    setFormMsg("")
    setSuccessNotice("")
    try {
      const verId = await seedDemoExamToSupabase(client, demoExam.questions as unknown as Array<Record<string, unknown>>)
      await loadExamsAndAttempts()
      setSelectedVersionId(verId)
      const qs = await getAdminQuestions(client, verId)
      setAdminQuestions(qs)
      if (qs.length > 0) {
        handleSelectQuestionPosition(1)
      }
      setSuccessNotice("Berhasil! 75 Soal Ujian telah di-seed dan dipublikasikan ke database Supabase Cloud.")
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Gagal menginisialisasi 75 soal ke Supabase Cloud.")
    } finally {
      setSeeding(false)
    }
  }

  const handleAdminSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormMsg("")
    setSuccessNotice("")

    if (!draft.question.trim() || draft.options.some((o) => !o.trim()) || !draft.explanation.trim() || !draft.examVersionId) {
      setFormMsg("Mohon lengkapi teks pertanyaan Arab, 4 opsi jawaban, dan pembahasan.")
      return
    }

    const selectedPkg = exams.find((ex) => ex.id === draft.examVersionId)
    const pkgTitle = selectedPkg?.title || "Paket Ujian"
    const isEditing = Boolean(draft.id)
    const actionLabel = isEditing ? `memperbarui Soal Nomor ${draft.position}` : `menambahkan Soal Baru Nomor ${draft.position}`

    const confirmSubmit = window.confirm(
      `Apakah Anda yakin ingin ${actionLabel} pada "${pkgTitle}" dan mempublikasikannya ke database Supabase Cloud?`
    )
    if (!confirmSubmit) return

    setSaving(true)
    try {
      const qid = await adminUpsertQuestion(client, {
        p_question_id: draft.id || null,
        p_exam_version_id: draft.examVersionId,
        p_position: draft.position,
        p_section: draft.section,
        p_question: draft.question.trim(),
        p_options: draft.options,
        p_correct_index: draft.correctIndex,
        p_explanation: draft.explanation.trim(),
        p_passage: draft.passage.trim() || null,
        p_audio_path: draft.audioPath.trim() || null,
      })

      // Refresh list of questions from Supabase
      const updatedQs = await getAdminQuestions(client, draft.examVersionId)
      setAdminQuestions(updatedQs)

      // Update draft with returned qid
      setDraft((prev) => ({ ...prev, id: qid }))
      setSuccessNotice(`Berhasil! Soal Nomor ${draft.position} pada "${pkgTitle}" telah diperbarui dan dipush ke database Supabase Cloud (ID: ${qid.slice(0, 8)}...).`)
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Gagal menyimpan soal ke database Supabase Cloud.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-dvh bg-[#F8FAFC] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Brand />
          <AccountMenu />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        {/* KPI Banner / Metrics Summary */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Total Sesi</span>
              <span className="grid size-9 place-items-center rounded-xl bg-[#E6F0EB] text-[#006C35]"><History size={18} /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{totalSessions}</p>
            <p className="mt-1 text-xs text-slate-500">Sesi ujian cloud tersimpan</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Rata-rata Skor</span>
              <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><Sparkles size={18} /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{avgScore}</p>
            <p className="mt-1 text-xs text-slate-500">Nilai rata-rata akunmu</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Skor Tertinggi</span>
              <span className="grid size-9 place-items-center rounded-xl bg-[#FFF7E8] text-[#C5A059]"><BookOpenCheck size={18} /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-[#006C35]">{maxScore}</p>
            <p className="mt-1 text-xs text-slate-500">Hasil pengerjaan terbaik</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Level Terbaru</span>
              <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-[#006C35]"><ShieldCheck size={18} /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{latestScore ? `CEFR ${latestScore.cefr}` : "—"}</p>
            <p className="mt-1 text-xs text-slate-500">{latestScore ? formatDate(latestScore.completedAt) : "Belum ada sesi"}</p>
          </div>
        </section>

        {/* Unified Navigation Tabs */}
        <div className="mt-8 flex items-center gap-2 border-b border-slate-200/80 pb-3 overflow-x-auto no-scrollbar flex-nowrap scroll-smooth -mx-5 px-5 sm:mx-0 sm:px-0 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("packages")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.96] ${
              activeTab === "packages" ? "bg-[#006C35] text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <PlayCircle size={17} /> Format Ujian
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("my_history")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.96] ${
              activeTab === "my_history" ? "bg-[#006C35] text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <History size={17} /> Riwayat Saya {completedAttempts.length > 0 && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs tabular-nums">{completedAttempts.length}</span>}
          </button>

          {isAdmin && (
            <>
              <div className="h-5 w-px bg-slate-300 mx-1 hidden sm:block" />
              <button
                type="button"
                onClick={() => setActiveTab("all_history")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.96] ${
                  activeTab === "all_history" ? "bg-amber-800 text-white shadow-sm" : "bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100"
                }`}
              >
                <Users size={17} /> History Semua User
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("user_mgmt")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.96] ${
                  activeTab === "user_mgmt" ? "bg-amber-800 text-white shadow-sm" : "bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100"
                }`}
              >
                <User size={17} /> Manajemen User
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("question_bank")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.96] ${
                  activeTab === "question_bank" ? "bg-amber-800 text-white shadow-sm" : "bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100"
                }`}
              >
                <BookOpenCheck size={17} /> Input & Revisi Soal
              </button>
            </>
          )}
        </div>

        {error ? <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}

        {/* Tab 1: Format Ujian */}
        {activeTab === "packages" && (
          <div className="mt-6 space-y-8">
            <section className="grid gap-7 rounded-[28px] bg-[#006C35] px-7 py-9 text-white shadow-[0_18px_45px_rgba(0,108,53,0.20)] md:grid-cols-[1.25fr_0.75fr] md:px-10">
              <div>
                <p className="inline-flex rounded-full bg-white/12 px-3 py-1.5 text-sm font-semibold text-emerald-50">CBT mandiri · tersimpan di akunmu</p>
                <h1 className="mt-5 max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">Bangun kesiapanmu sebelum Hamza Test.</h1>
                <p className="mt-4 max-w-xl leading-7 text-emerald-50/85 text-pretty">Latih ritme ujian yang fokus: waktu terbatas, audio berkuota, dan analisis kompetensi.</p>
                {activeAttempt ? (
                  <button
                    onClick={() => {
                      posthog.capture("exam_resumed", { attempt_id: activeAttempt.id, mode: "cloud" })
                      navigate({ to: "/exam/$attemptId", params: { attemptId: activeAttempt.id } })
                    }}
                    className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#006C35] transition-transform active:scale-[0.96]"
                  >
                    <TimerReset size={18} /> Lanjutkan {activeExam?.title ?? "ujian"} <ArrowRight size={17} />
                  </button>
                ) : null}
              </div>
              <div className="grid content-end gap-3 sm:grid-cols-3 md:grid-cols-1">
                <Metric icon={<Clock3 size={19} />} label="Sesi tersimpan" value={`${attempts.length} attempt`} />
                <Metric icon={<BookOpenCheck size={19} />} label="Paket terbit" value={`${exams.length} paket`} />
                <Metric icon={<Headphones size={19} />} label="Audio" value="Maks. 2x" />
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
              <div className="rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100 sm:p-7">
                <p className="text-sm font-bold text-[#006C35]">Paket tersedia</p>
                <h2 className="mt-1 text-xl font-bold">Pilih format latihan</h2>
                <div className="mt-6 grid gap-3">
                  {exams.length === 0 ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 text-amber-900">
                      <p className="text-sm font-bold">Belum ada paket ujian terbit di Supabase Cloud.</p>
                      <p className="mt-1 text-xs text-amber-800">Sebagai Admin, Anda dapat menginisialisasi 75 soal ke database Cloud dengan mengeklik tombol di tab Input & Revisi Soal.</p>
                    </div>
                  ) : (
                    exams.map((exam) => (
                      <article key={exam.id} className="rounded-2xl border border-[#E6F0EB] bg-[#FCFFFD] p-5">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <h3 className="font-bold">{exam.title}</h3>
                            <p className="mt-1 text-sm text-slate-600">{exam.subtitle}</p>
                          </div>
                          <button
                            onClick={() => navigate({ to: "/instructions/$versionId", params: { versionId: exam.id } })}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-4 text-sm font-bold text-white transition-transform active:scale-[0.96]"
                          >
                            <PlayCircle size={17} /> Mulai
                          </button>
                        </div>
                        <p className="mt-4 text-sm text-slate-600">
                          <Clock3 className="mr-2 inline size-4" /> {exam.durationMinutes} menit · Full Test
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>

              <aside className="rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#FFF7E8] text-[#C5A059]"><History size={20} /></span>
                  <div>
                    <p className="text-sm font-bold">Riwayat terakhir</p>
                    <p className="text-xs text-slate-500">Tersimpan di akun cloud</p>
                  </div>
                </div>
                {latestScore ? (
                  <div className="mt-7">
                    <p className="text-4xl font-bold tabular-nums text-[#006C35]">{latestScore.score}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(latestScore.completedAt)}</p>
                    <div className="mt-4 flex gap-2">
                      <span className="rounded-lg bg-[#E6F0EB] px-3 py-1.5 text-sm font-bold text-[#006C35]">CEFR {latestScore.cefr}</span>
                      <button
                        onClick={() => navigate({ to: "/review/$attemptId", params: { attemptId: latestScore.id } })}
                        className="rounded-lg border border-[#006C35] px-3 py-1.5 text-sm font-bold text-[#006C35] transition-transform active:scale-[0.96]"
                      >
                        Pembahasan
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-7 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">Belum ada hasil ujian.</p>
                )}
              </aside>
            </section>
          </div>
        )}

        {/* Tab 2: Riwayat Ujian Saya */}
        {activeTab === "my_history" && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Riwayat Ujian Saya</h2>
                <p className="mt-1 text-sm text-slate-600">Daftar sesi latihan yang tersimpan di akun cloud kamu.</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="text"
                  placeholder="Cari tanggal/skor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-[#006C35] focus:outline-none"
                />
              </div>
            </div>

            {filteredMyHistory.length === 0 ? (
              <div className="mt-8 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
                <History className="mx-auto text-slate-400 mb-2" size={32} />
                {completedAttempts.length === 0 ? "Belum ada riwayat ujian cloud tersimpan." : "Tidak ditemukan riwayat yang sesuai."}
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
                      <th className="py-3 px-4">Tanggal Selesai</th>
                      <th className="py-3 px-4 text-center">Jawaban Benar</th>
                      <th className="py-3 px-4 text-center">Skor Akhir</th>
                      <th className="py-3 px-4 text-center">Level CEFR</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMyHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-4 font-medium text-slate-900 tabular-nums">{formatDate(item.completedAt)}</td>
                        <td className="py-4 px-4 text-center tabular-nums font-semibold text-slate-600">{item.correctCount} / {item.totalQuestions}</td>
                        <td className="py-4 px-4 text-center font-bold tabular-nums text-lg text-[#006C35]">{item.score}</td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-block rounded-lg bg-[#E6F0EB] px-2.5 py-1 text-xs font-bold text-[#006C35]">{item.cefr}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => navigate({ to: "/review/$attemptId", params: { attemptId: item.id } })}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#006C35] px-3 py-1.5 text-xs font-bold text-white transition-transform active:scale-[0.96]"
                          >
                            <BookOpenCheck size={14} /> Lihat Pembahasan
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Tab 3 (Admin): History Semua User */}
        {isAdmin && activeTab === "all_history" && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] border border-amber-100 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 mb-1">Portal Admin Supabase</div>
                <h2 className="text-xl font-bold text-slate-900">History Semua Peserta</h2>
                <p className="mt-1 text-sm text-slate-600">Daftar seluruh pengerjaan ujian peserta di database cloud.</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="text"
                  placeholder="Cari user ID/skor/paket..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
                    <th className="py-3 px-4">User ID / Email</th>
                    <th className="py-3 px-4">Paket Ujian</th>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4 text-center">Benar</th>
                    <th className="py-3 px-4 text-center">Skor</th>
                    <th className="py-3 px-4 text-center">CEFR</th>
                    <th className="py-3 px-4 text-right">Aksi Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAllAttempts.map((item) => (
                    <tr key={item.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="py-4 px-4 font-mono text-xs font-semibold text-slate-800">{item.userId}</td>
                      <td className="py-4 px-4 font-semibold text-slate-700">{item.examTitle}</td>
                      <td className="py-4 px-4 font-medium text-slate-600 tabular-nums">{formatDate(item.completedAt)}</td>
                      <td className="py-4 px-4 text-center tabular-nums text-slate-600">{item.correctCount} / {item.totalQuestions}</td>
                      <td className="py-4 px-4 text-center font-bold tabular-nums text-lg text-amber-800">{item.score}</td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-block rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{item.cefr}</span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setInspectAttemptId(item.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-bold text-white transition-transform active:scale-[0.96]"
                        >
                          <BookOpenCheck size={14} /> Inspeksi Jawaban
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Tab 4 (Admin): Manajemen User */}
        {isAdmin && activeTab === "user_mgmt" && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] border border-amber-100 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 mb-1">Portal Admin Supabase</div>
                <h2 className="text-xl font-bold text-slate-900">Manajemen User & Hak Akses</h2>
                <p className="mt-1 text-sm text-slate-600">Pengaturan role admin dan peserta terdaftar.</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-amber-50/50 p-5 border border-amber-200">
              <h3 className="font-bold text-amber-900">Status Akun Terhubung</h3>
              <p className="mt-1 text-sm text-amber-800">
                Akun aktif: <strong className="font-semibold">{auth.displayName}</strong> | Role terdeteksi: <strong className="uppercase font-bold">{auth.role}</strong>
              </p>
              <button
                type="button"
                onClick={() => auth.setRole(auth.role === "admin" ? "user" : "admin")}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-800 px-4 py-2 text-xs font-bold text-white transition-transform active:scale-[0.96]"
              >
                Ganti Role Pengujian (Simulasi Local/Cloud)
              </button>
            </div>
          </section>
        )}

        {/* Tab 5 (Admin): Input & Revisi Soal */}
        {isAdmin && activeTab === "question_bank" && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] border border-amber-100 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 mb-1">Editor DB Supabase</div>
                <h2 className="text-xl font-bold text-slate-900">Input & Revisi Soal Cloud</h2>
                <p className="mt-1 text-sm text-slate-600">Pilih paket dan nomor soal untuk memuat data lama secara otomatis, edit, lalu push ke Supabase.</p>
              </div>
              {exams.length === 0 && (
                <button
                  type="button"
                  disabled={seeding}
                  onClick={handleSeedCloudData}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-800 px-4 py-2 text-sm font-bold text-white shadow-sm transition-transform active:scale-[0.96] disabled:opacity-50"
                >
                  <Sparkles size={16} /> {seeding ? "Mengisi 75 Soal..." : "Seed Paket Demo (75 Soal) ke Cloud"}
                </button>
              )}
            </div>

            {/* Notification Banner */}
            {successNotice && (
              <div className="mt-5 flex items-start justify-between rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
                <div className="flex items-center gap-2">
                  <Check className="size-5 shrink-0 text-[#006C35]" />
                  <span className="text-sm font-bold">{successNotice}</span>
                </div>
                <button type="button" onClick={() => setSuccessNotice("")} className="text-emerald-700 hover:text-emerald-950">
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Selection Controls: Package & Question Number */}
            <div className="mt-6 grid gap-4 rounded-2xl bg-amber-50/50 p-5 border border-amber-200 sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-900">
                1. Pilih Paket Ujian
                <select
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm"
                >
                  {exams.length === 0 ? (
                    <option value="">(Belum Ada Paket - Klik Seed di atas)</option>
                  ) : (
                    exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>{ex.title} (ID: {ex.id.slice(0, 8)}...)</option>
                    ))
                  )}
                </select>
              </label>

              <label className="block text-xs font-bold uppercase tracking-wider text-amber-900">
                2. Pilih Nomor Soal (Auto-Load Data)
                <select
                  value={selectedPos}
                  onChange={(e) => handleSelectQuestionPosition(parseInt(e.target.value, 10) || 1)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm"
                >
                  {adminQuestions.map((q) => (
                    <option key={q.id} value={q.position}>
                      Nomor {q.position} ({q.section.toUpperCase()}) — {q.question.slice(0, 30)}...
                    </option>
                  ))}
                  <option value={adminQuestions.length + 1}>
                    + Tambah Soal Baru (Nomor {adminQuestions.length + 1})
                  </option>
                </select>
              </label>
            </div>

            {/* Form Editor */}
            <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <form onSubmit={handleAdminSaveQuestion} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                  <span className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                    {draft.id ? `Mode: Edit Soal Nomor ${draft.position} (ID: ${draft.id.slice(0, 8)}...)` : `Mode: Tambah Soal Baru Nomor ${draft.position}`}
                  </span>
                  {draft.id && (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      ✓ Data lama dimuat otomatis
                    </span>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Nomor Posisi
                    <input
                      type="number"
                      min={1}
                      value={draft.position}
                      onChange={(e) => setDraft({ ...draft, position: parseInt(e.target.value, 10) || 1 })}
                      className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold text-sm"
                    />
                  </label>

                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Seksi / Kompetensi
                    <select
                      value={draft.section}
                      onChange={(e) => setDraft({ ...draft, section: e.target.value as Section })}
                      className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold text-sm"
                    >
                      <option value="listening">Istima’ (Listening)</option>
                      <option value="reading">Qira’ah (Reading)</option>
                      <option value="grammar">Tarkib (Grammar)</option>
                      <option value="structures">Tarākīb (Structures)</option>
                      <option value="writing">Kitābah (Writing)</option>
                      <option value="speaking">Muḥādatsah (Speaking)</option>
                    </select>
                  </label>

                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Path Audio (Opsional)
                    <input
                      type="text"
                      value={draft.audioPath}
                      onChange={(e) => setDraft({ ...draft, audioPath: e.target.value })}
                      placeholder="Contoh: audio/q1.mp3"
                      className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    />
                  </label>
                </div>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Teks Passage / Bacaan (Opsional)
                  <textarea
                    dir="rtl"
                    value={draft.passage}
                    onChange={(e) => setDraft({ ...draft, passage: e.target.value })}
                    placeholder="أدخل النص القرائي هنا إن وجد..."
                    className="font-arabic mt-1.5 min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-base text-right"
                  />
                </label>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Teks Pertanyaan Bahasa Arab (RTL)
                  <textarea
                    dir="rtl"
                    value={draft.question}
                    onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                    placeholder="أدخل نص السؤال هنا..."
                    className="font-arabic mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-lg text-right font-medium"
                  />
                </label>

                <fieldset className="mt-4">
                  <legend className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Opsi Jawaban & Kunci Jawaban <span className="font-normal text-slate-500">(pilih radio button untuk menentukan kunci)</span>
                  </legend>
                  <div className="mt-2 space-y-2.5">
                    {draft.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="correct_index_cloud"
                          checked={draft.correctIndex === i}
                          onChange={() => setDraft({ ...draft, correctIndex: i })}
                          className="size-4 accent-[#006C35]"
                        />
                        <span className="text-xs font-bold text-slate-500 w-5">{optionLetters[i]}</span>
                        <input
                          dir="rtl"
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...draft.options]
                            newOpts[i] = e.target.value
                            setDraft({ ...draft, options: newOpts })
                          }}
                          placeholder={`Opsi ${optionLetters[i]}`}
                          className="font-arabic min-h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-right"
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Pembahasan Kunci (Penjelasan Arab & Indonesia)
                  <textarea
                    value={draft.explanation}
                    onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                    placeholder="Tuliskan pembahasan terstruktur di sini..."
                    className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6"
                  />
                </label>

                {formMsg ? <p className="mt-3 rounded-xl bg-red-100 p-3 text-xs font-bold text-red-900">{formMsg}</p> : null}

                <div className="mt-5 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-6 text-sm font-bold text-white transition-transform active:scale-[0.96] disabled:opacity-50"
                  >
                    <Save size={17} /> {saving ? "Menyimpan & Push ke Supabase..." : "Simpan & Push ke Supabase Cloud"}
                  </button>
                </div>
              </form>

              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Daftar Soal Tersimpan</h3>
                  <span className="text-xs font-bold text-slate-500 tabular-nums">{adminQuestions.length} Soal Total</span>
                </div>

                <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {adminQuestions.map((q) => (
                    <article
                      key={q.id}
                      onClick={() => handleSelectQuestionPosition(q.position)}
                      className={`cursor-pointer rounded-xl border p-4 transition-all ${
                        selectedPos === q.position ? "border-[#006C35] bg-[#E6F0EB]/30 ring-2 ring-[#006C35]" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-[#006C35]">No {q.position} · {q.section}</span>
                          <p dir="rtl" className="font-arabic mt-1.5 text-base text-right leading-7">{q.question}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Kunci: Opsi {optionLetters[q.correctIndex]} ({(q.options || [])[q.correctIndex] || ""})
                          </p>
                        </div>
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-[#006C35] shrink-0">
                          Edit
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Inspect Attempt Modal */}
      {inspectAttemptId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl max-h-[90dvh] overflow-y-auto sm:p-8">
            <button
              type="button"
              onClick={() => setInspectAttemptId(null)}
              className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={20} />
            </button>

            <div className="border-b border-slate-100 pb-4">
              <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">Inspeksi Jawaban Peserta (Admin)</span>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">Detail Attempt ID: {inspectAttemptId.slice(0, 8)}...</h2>
            </div>

            <div className="mt-6 space-y-4">
              {inspectQuestions.map((q: ReviewQuestion, idx: number) => (
                <div key={q.id || idx} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#006C35]">Soal {q.position || idx + 1} · {q.section}</span>
                    <span className={`text-xs font-bold rounded-lg px-2.5 py-1 ${q.selectedIndex === q.correctIndex ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {q.selectedIndex === q.correctIndex ? "Benar" : "Salah / Berbeda"}
                    </span>
                  </div>
                  <p dir="rtl" className="font-arabic text-right text-lg leading-8 text-slate-900 mb-3">{q.question}</p>
                  <div className="grid gap-2">
                    {(q.options || []).map((opt: string, oIdx: number) => {
                      const isCorrectKey = oIdx === q.correctIndex
                      const isUserChoice = oIdx === q.selectedIndex
                      return (
                        <div
                          key={oIdx}
                          dir="rtl"
                          className={`flex items-center justify-between rounded-xl border p-3 font-arabic text-base ${
                            isCorrectKey ? "border-green-300 bg-green-50 text-green-900 font-bold" : isUserChoice ? "border-red-300 bg-red-50 text-red-900" : "border-slate-100 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="grid size-6 place-items-center rounded bg-white text-xs font-bold font-sans shadow-sm">{optionLetters[oIdx]}</span>
                            <span>{opt}</span>
                          </div>
                          {isCorrectKey && <Check className="size-4 text-green-700 font-sans" />}
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 rounded-xl bg-[#FFFBF4] border border-amber-100 p-3 text-xs leading-6 text-slate-700">
                    <span className="font-bold text-[#8A5A12]">Pembahasan: </span>
                    {q.explanation}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectAttemptId(null)}
                className="rounded-xl bg-[#006C35] px-5 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.96]"
              >
                Tutup Inspeksi
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function CloudInstructionsPage() {
  const client = useClient(); const { versionId } = instructionsRoute.useParams(); const navigate = useNavigate(); const [exam, setExam] = useState<PublishedExam | null>(null); const [starting, setStarting] = useState(false); const [error, setError] = useState('')
  useEffect(() => { void getPublishedExams(client).then((items) => setExam(items.find((item) => item.id === versionId) ?? null)).catch(() => setError('Paket ujian tidak tersedia.')) }, [client, versionId])
  const begin = async () => { setStarting(true); try { const attempt = await startAttempt(client, versionId); posthog.capture('exam_started', { attempt_id: attempt.id, exam_version_id: versionId, mode: 'cloud', duration_minutes: exam?.durationMinutes }); navigate({ to: '/exam/$attemptId', params: { attemptId: attempt.id } }) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ujian belum dapat dimulai.') } finally { setStarting(false) } }
  return <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 sm:px-8 sm:py-12"><div className="mx-auto max-w-3xl"><Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft size={17} />Kembali ke dashboard</Link><section className="mt-5 rounded-3xl bg-white p-7 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-9"><span className="grid size-12 place-items-center rounded-2xl bg-[#E6F0EB] text-[#006C35]"><ShieldCheck size={24} /></span><p className="mt-6 text-sm font-bold text-[#006C35]">Sebelum memulai</p><h1 className="mt-1 text-3xl font-bold text-balance">{exam?.title ?? 'Memuat paket…'}</h1><p className="mt-4 leading-7 text-slate-600">Timer mulai saat kamu menekan tombol mulai. Jawaban disimpan ke akunmu dan akan tetap tersedia setelah refresh.</p><div className="mt-8 grid gap-3 sm:grid-cols-2"><Instruction icon={<Clock3 />} title="Waktu berjalan" text={`${exam?.durationMinutes ?? '—'} menit untuk menyelesaikan tes.`} /><Instruction icon={<Headphones />} title="Cek audio" text="Setiap audio hanya boleh diputar dua kali." /><Instruction icon={<Bookmark />} title="Tandai ragu" text="Kembali ke soal yang perlu diperiksa." /><Instruction icon={<Send />} title="Kirim jawaban" text="Ujian terkunci otomatis saat waktu habis." /></div>{error ? <p className="mt-5 text-sm font-semibold text-red-700">{error}</p> : null}<button disabled={!exam || starting} onClick={() => void begin()} className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white active:scale-[0.96] disabled:opacity-50"><PlayCircle size={18} />{starting ? 'Menyiapkan…' : 'Saya siap, mulai ujian'}</button></section></div></main>
}

function CloudExamPage() {
  const client = useClient(); const { attemptId } = examRoute.useParams(); const navigate = useNavigate(); const [attempt, setAttempt] = useState<CloudAttempt | null>(null); const [questions, setQuestions] = useState<PublicQuestion[]>([]); const [answers, setAnswers] = useState<Record<string, CloudAnswer>>({}); const [index, setIndex] = useState(0); const [remaining, setRemaining] = useState(0); const [audioUrl, setAudioUrl] = useState<string>(); const completing = useRef(false); const [grading, setGrading] = useState(false); const [speakingSaveError, setSpeakingSaveError] = useState<string | null>(null); const [isMobileGridOpen, setIsMobileGridOpen] = useState(false)
  
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
      const aiResults = await Promise.allSettled([
        evaluateWriting(client, attemptId),
        evaluateSpeaking(client, attemptId),
      ])
      for (const result of aiResults) {
        if (result.status === 'rejected') {
          console.error('AI grading failed:', result.reason)
        } else {
          console.log('AI grading result:', result.value)
        }
      }
      posthog.capture('exam_submitted', { attempt_id: attemptId, mode: 'cloud', total_questions: questions.length })
    } finally {
      navigate({ to: '/results/$attemptId', params: { attemptId }, replace: true })
    } 
  }, [attemptId, client, navigate, questions.length])

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
  const speakingAudioLoading = question?.answerType === 'speaking' && speakingAudioUrl === undefined
  const answeredCount = Object.values(answers).filter((item) => 
    item.selectedIndex !== undefined || 
    (item.answerText && item.answerText.trim().length > 0) ||
    (item.audioStoragePath && item.audioStoragePath.trim().length > 0)
  ).length

  const persist = useCallback(async (
    selectedIndex: number | undefined = answer?.selectedIndex,
    bookmarked = answer?.bookmarked ?? false,
    answerText: string | undefined = answer?.answerText,
    audioStoragePath: string | undefined = answer?.audioStoragePath
  ) => {
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
  }, [answer, attemptId, client, question])

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
  
  const toggleBookmark = async () => { const willBookmark = !answer?.bookmarked; await persist(answer?.selectedIndex, willBookmark, answer?.answerText); posthog.capture('question_bookmarked', { section: question.section, is_bookmarked: willBookmark, mode: 'cloud' }) }
  
  const playAudio = async () => {
    try {
      await recordAudioPlay(client, attemptId, question.id)
      const sharedQuestions = questions.filter(
        (q) => q.audioPath && q.audioPath === question.audioPath
      )
      setAnswers((current) => {
        const updated = { ...current }
        for (const q of sharedQuestions) {
          const ans = current[q.id]
          const next = {
            questionId: q.id,
            selectedIndex: ans?.selectedIndex,
            bookmarked: ans?.bookmarked ?? false,
            viewedAt: ans?.viewedAt,
            audioPlayCount: (ans?.audioPlayCount ?? 0) + 1,
            answerText: ans?.answerText,
            audioStoragePath: ans?.audioStoragePath
          }
          updated[q.id] = next
          useExamStore.getState().cacheCloudAnswer(attemptId, q.id, next)
        }
        return updated
      })
      const finalAns = answers[question.id]
      posthog.capture('audio_played', { section: question.section, play_number: (finalAns?.audioPlayCount ?? 0) + 1, mode: 'cloud' })
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
      posthog.capture('speaking_recording_completed', { section: question.section, mode: 'cloud' })
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
        <div className="hidden xl:block">
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
        </div>
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
                    {speakingAudioLoading ? (
                      <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center font-sans text-sm text-slate-500" role="status">
                        Memuat rekaman tersimpan…
                      </div>
                    ) : (
                      <SpeakingRecorder
                        key={`${question.id}:${speakingAudioUrl ?? ''}`}
                        questionId={question.id}
                        preparationSeconds={question.preparationSeconds ?? 30}
                        maxRecordingSeconds={question.maxRecordingSeconds ?? 60}
                        existingAudioUrl={speakingAudioUrl}
                        onRecordingComplete={handleSpeakingComplete}
                      />
                    )}
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

    {/* Mobile Sticky Bottom Navigation Bar */}
    <div className="sticky bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 shadow-lg xl:hidden pb-safe flex items-center justify-between gap-2">
      <button
        type="button"
        disabled={index === 0}
        onClick={() => setIndex(index - 1)}
        className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"
      >
        <ChevronLeft size={16} /> Prev
      </button>

      <button
        type="button"
        onClick={() => setIsMobileGridOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#E6F0EB] px-3.5 py-2 text-xs font-bold text-[#006C35] hover:bg-[#d8e8de] active:scale-[0.97]"
      >
        <Grid size={15} className="text-[#006C35]" />
        <span>Soal {index + 1}/{questions.length}</span>
      </button>

      <button
        type="button"
        onClick={() => void toggleBookmark()}
        className={`inline-flex min-h-11 items-center justify-center rounded-xl p-2.5 text-xs font-bold transition-all ${
          answer?.bookmarked ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-slate-100 text-slate-600"
        }`}
        aria-label="Tandai Ragu"
      >
        <Bookmark size={16} fill={answer?.bookmarked ? "currentColor" : "none"} />
      </button>

      <button
        type="button"
        disabled={index === questions.length - 1}
        onClick={() => setIndex(index + 1)}
        className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-[#006C35] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40 active:scale-[0.96]"
      >
        Next <ArrowRight size={16} />
      </button>
    </div>

    {/* Mobile Question Grid Drawer Modal */}
    {isMobileGridOpen && (
      <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/60 backdrop-blur-xs xl:hidden">
        <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl pb-safe">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h3 className="font-bold text-slate-900">Daftar Soal Simulasi</h3>
              <p className="text-xs text-slate-500">Pilih nomor soal untuk berpindah</p>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileGridOpen(false)}
              className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              <X size={18} />
            </button>
          </div>
          <QuestionGrid 
            questions={questions} 
            activeIndex={index} 
            answers={Object.fromEntries(Object.entries(answers).flatMap(([key, value]) => value.selectedIndex === undefined ? [] : [[key, value.selectedIndex]])) as Record<string, number>} 
            writingAnswers={localWritingAnswers}
            speakingAnswers={localSpeakingAnswers}
            bookmarks={Object.values(answers).filter((item) => item.bookmarked).map((item) => item.questionId)} 
            viewedQuestionIds={Object.keys(answers)} 
            onSelect={(idx) => { setIndex(idx); useExamStore.getState().setCloudCurrentIndex(attemptId, idx); setIsMobileGridOpen(false) }} 
          />
        </div>
      </div>
    )}
  </main>
}

function CloudResultsPage() {
  const client = useClient(); const { attemptId } = resultsRoute.useParams(); const navigate = useNavigate(); const [result, setResult] = useState<CloudAttempt | null>(null)
  useEffect(() => { void getAttempt(client, attemptId).then((attempt) => { if (attempt.state === 'active') navigate({ to: '/exam/$attemptId', params: { attemptId }, replace: true }); else setResult(attempt) }).catch(() => navigate({ to: '/' })) }, [attemptId, client, navigate])
  if (!result) return null; const chartOrder: Section[] = ['listening', 'reading', 'grammar', 'structures', 'writing', 'speaking']; const chartData = chartOrder.filter((section) => section in (result.sectionScores ?? {})).map((section) => ({ name: sectionCopy[section].label, description: sectionCopy[section].description, score: result.sectionScores?.[section] ?? 0 }))
  return <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 text-slate-900 sm:px-8 sm:py-12"><div className="mx-auto max-w-5xl"><Brand /><section className="mt-7 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]"><div className="rounded-3xl bg-[#006C35] p-8 text-white shadow-[0_18px_45px_rgba(0,108,53,0.20)]"><span className="grid size-12 place-items-center rounded-2xl bg-white/13"><Check size={25} /></span><p className="mt-6 text-sm font-bold text-emerald-100">Simulasi selesai</p><h1 className="mt-2 text-3xl font-bold">Hasil latihanmu</h1><div className="mt-8 flex items-end gap-4"><span className="text-6xl font-bold tabular-nums">{result.score}</span><span className="mb-2 text-emerald-100">/ 100</span></div><div className="mt-7 flex justify-between rounded-2xl bg-white/10 px-4 py-4"><span className="text-sm text-emerald-50">Level perkiraan</span><span className="rounded-lg bg-[#C5A059] px-3 py-1.5 text-sm font-bold text-[#17321F]">CEFR {result.cefr}</span></div><p className="mt-5 text-sm leading-6 text-emerald-50/85">{result.correctCount} dari {result.totalQuestions} soal dijawab benar.</p></div><section className="rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-8"><p className="text-sm font-bold text-[#006C35]">Analisis kompetensi</p><h2 className="mt-1 text-xl font-bold">Performa per seksi</h2><p className="mt-2 text-sm text-slate-500">Batang mengikuti urutan seksi saat ujian. Garis emas menunjukkan target 60.</p><div className="mt-4 h-72"><Suspense fallback={<div className="h-full rounded-xl bg-slate-100" />}><PerformanceChart data={chartData} /></Suspense></div></section></section><div className="mt-6 flex justify-end"><Link to="/review/$attemptId" params={{ attemptId }} onClick={() => posthog.capture('exam_review_started', { attempt_id: attemptId, mode: 'cloud', score: result.score, cefr: result.cefr })} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white active:scale-[0.96]"><BookOpenCheck size={17} />Tinjau pembahasan</Link></div></div></main>
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
      const feedback = question.speakingFeedback as {
        pronunciation_score?: number
        fluency_score?: number
        relevance_score?: number
        transcript?: string
        corrections?: Array<{ original: string; corrected: string; category: string; explanation_id: string }>
        feedback_id?: string
        feedback_ar?: string
      } | undefined
      const score = question.speakingScore ?? 0;
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
  const [speakingAudioUrl, setSpeakingAudioUrl] = useState<string | null | undefined>(undefined)
  const [prevQuestionId, setPrevQuestionId] = useState<string | undefined>(undefined)

  if (question?.id !== prevQuestionId) {
    setPrevQuestionId(question?.id)
    setSpeakingAudioUrl(undefined)
  }

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
