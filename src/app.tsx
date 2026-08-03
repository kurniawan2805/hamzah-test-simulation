
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
} from "@tanstack/react-router"
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Bookmark,
  Check,
  ChevronLeft,
  Clock3,
  Headphones,
  History,
  Grid,
  ListChecks,
  MessageSquareText,
  PlayCircle,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  Users,
  X,
} from "lucide-react"
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { QuestionGrid } from "./components/question-grid"
import { AiDiscussionGate } from "./components/ai-discussion-gate"
import { UserManagement } from "./components/user-management"
import { AdminBundleUploader } from "./components/admin-bundle-uploader"
import { TierBadge } from "./components/tier-badge"
import { demoExam } from "./data/exam-data"
import { calculateRemainingSeconds, createSessionResult } from "./lib/scoring"
import { FREE_ATTEMPT_LIMIT, freeAttemptsRemaining } from "./lib/tiers"
import { useExamStore } from "./store/exam-store"
import type { ExamFinishReason, Question, Section, SessionResult } from "./types"
import { AccountMenu, AppAuthProvider, RequireAuth, useAppAuth } from "./lib/auth"
import { useSupabaseClient } from "./lib/supabase"
import { CloudApp } from "./cloud-app"
import { posthog } from "./lib/posthog"

const PerformanceChart = lazy(() => import("./components/performance-chart"))

const sectionCopy: Record<Section, { label: string; description: string }> = {
  listening: { label: "Istima’", description: "Pemahaman mendengar" },
  reading: { label: "Qira’ah", description: "Pemahaman membaca" },
  grammar: { label: "Tarkib", description: "Tata bahasa" },
  structures: { label: "Tarākīb", description: "Struktur bahasa" },
  writing: { label: "Kitābah", description: "Tugas menulis" },
  speaking: { label: "Muḥādatsah", description: "Tugas berbicara" },
}

const optionLetters = ["أ", "ب", "ج", "د"]

const rootRoute = createRootRoute({ component: () => <Outlet /> })
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: DashboardPage })
const instructionsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/instructions", component: InstructionsPage })
const examRoute = createRoute({ getParentRoute: () => rootRoute, path: "/exam", component: ExamPage })
const resultsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/results", component: ResultsPage })
const reviewRoute = createRoute({ getParentRoute: () => rootRoute, path: "/review", component: ReviewPage })
const questionBankRoute = createRoute({ getParentRoute: () => rootRoute, path: "/question-bank", component: QuestionBankPage })

const routeTree = rootRoute.addChildren([dashboardRoute, instructionsRoute, examRoute, resultsRoute, reviewRoute, questionBankRoute])
const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true })

export function App() {
  return (
    <AppAuthProvider>
      <RequireAuth>
        <AppRuntime />
      </RequireAuth>
    </AppAuthProvider>
  )
}

function AppRuntime() {
  const client = useSupabaseClient()
  const cloudEnabled = import.meta.env.VITE_ENABLE_CLOUD === "true"
  if (cloudEnabled && client) return <CloudApp client={client} />
  return <RouterProvider router={router} />
}

type TabType = "packages" | "my_history" | "all_history" | "user_mgmt" | "question_bank" | "bundle_upload" | "ai_discussion"

function DashboardPage() {
  const navigate = useNavigate()
  const auth = useAppAuth()
  const isAdmin = auth.role === "admin"
  const historyState = useExamStore((state) => state.history)
  const history = useMemo(() => historyState || [], [historyState])
  const customQuestionsState = useExamStore((state) => state.customQuestions)
  const customQuestions = useMemo(() => customQuestionsState || [], [customQuestionsState])
  const saveCustomQuestion = useExamStore((state) => state.saveCustomQuestion)
  const deleteCustomQuestion = useExamStore((state) => state.deleteCustomQuestion)
  
  const activeExamId = useExamStore((state) => state.activeExamId)
  const submittedAt = useExamStore((state) => state.submittedAt)
  const hasActiveSession = activeExamId === demoExam.id && !submittedAt

  const [activeTab, setActiveTab] = useState<TabType>("packages")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedAttempt, setSelectedAttempt] = useState<SessionResult | null>(null)


  // Aggregate mock all-user attempts for admin view
  const mockAllAttempts = useMemo(() => {
    const userAttempts = history.map((item) => ({
      ...item,
      userName: auth.displayName || "Peserta Demo",
      userId: "demo-user",
      userEmail: "peserta@hamza.test",
    }))
    const mockOthers = [
      { id: "att-101", examId: demoExam.id, completedAt: 1753500000000, score: 85, correctCount: 64, totalQuestions: 75, cefr: "B2" as const, sectionScores: { listening: 80, reading: 88, grammar: 85, structures: 87, writing: 82, speaking: 85 }, reason: "manual" as const, userName: "Ahmad Dahlan", userId: "user-002", userEmail: "ahmad@hamza.test" },
      { id: "att-102", examId: demoExam.id, completedAt: 1753200000000, score: 92, correctCount: 69, totalQuestions: 75, cefr: "C1" as const, sectionScores: { listening: 95, reading: 90, grammar: 92, structures: 91, writing: 90, speaking: 94 }, reason: "manual" as const, userName: "Fatimah Az-Zahra", userId: "user-003", userEmail: "fatimah@hamza.test" },
    ]
    return [...userAttempts, ...mockOthers]
  }, [history, auth.displayName])

  // Statistics KPIs
  const totalSessions = history.length
  const avgScore = totalSessions > 0 ? Math.round(history.reduce((acc, curr) => acc + curr.score, 0) / totalSessions) : 0
  const maxScore = totalSessions > 0 ? Math.max(...history.map((h) => h.score)) : 0
  const latestResult = history[0]
  const usedFreeAttempts = history.filter((item) => item.examId === demoExam.id).length
  const freeAttemptsLeft = freeAttemptsRemaining(auth.tier, usedFreeAttempts, isAdmin)
  const demoQuotaExhausted = !hasActiveSession && freeAttemptsLeft === 0

  const filteredHistory = history.filter((item) => {
    const dateStr = formatDate(item.completedAt).toLowerCase()
    return dateStr.includes(searchTerm.toLowerCase()) || String(item.score).includes(searchTerm)
  })

  const filteredAllAttempts = mockAllAttempts.filter((item) => {
    const term = searchTerm.toLowerCase()
    return item.userName.toLowerCase().includes(term) || item.userEmail.toLowerCase().includes(term) || String(item.score).includes(term)
  })

  // Visual Question Bank Form State
    const allDemoQuestions = useMemo(() => [...demoExam.questions, ...customQuestions], [customQuestions])

  const [selectedPos, setSelectedPos] = useState<number>(1)
  const [questionMsg, setQuestionMsg] = useState("")
  const [successNotice, setSuccessNotice] = useState("")

  const [draft, setDraft] = useState<Partial<Question>>(() => {
    const first = allDemoQuestions[0]
    return first ? { ...first } : { section: "reading", question: "", options: ["", "", "", ""], correct_index: 0, explanation: "", passage: "" }
  })

  // Handle selecting a question position in Demo mode
  const handleSelectQuestionPosition = (pos: number) => {
    setSelectedPos(pos)
    setQuestionMsg("")
    setSuccessNotice("")
    const existing = allDemoQuestions[pos - 1]
    if (existing) {
      setDraft({ ...existing, options: existing.options ? [...existing.options] : ["", "", "", ""] })
    } else {
      setDraft({
        id: `q_custom_${Date.now()}`,
        section: "reading",
        question: "",
        options: ["", "", "", ""],
        correct_index: 0,
        explanation: "",
        passage: "",
      })
    }
  }

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault()
    setQuestionMsg("")
    setSuccessNotice("")

    if (!draft.question?.trim() || draft.options?.some((o) => !o.trim()) || !draft.explanation?.trim()) {
      setQuestionMsg("Lengkapi pertanyaan Arab, 4 opsi jawaban, dan pembahasan.")
      return
    }

    const isEditing = Boolean(draft.id && allDemoQuestions.some((q) => q.id === draft.id))
    const actionLabel = isEditing ? `memperbarui Soal Nomor ${selectedPos}` : `menambahkan Soal Baru Nomor ${selectedPos}`

    const confirmed = window.confirm(`Apakah Anda yakin ingin ${actionLabel} pada Paket Simulasi Demo?`)
    if (!confirmed) return

    const newQuestion: Question = {
      id: draft.id || `q_custom_${Date.now()}`,
      section: draft.section || "reading",
      question: draft.question.trim(),
      options: (draft.options && draft.options.length === 4 ? draft.options : ["", "", "", ""]) as [string, string, string, string],
      correct_index: draft.correct_index || 0,
      explanation: draft.explanation.trim(),
      passage: draft.passage?.trim() || undefined,
      audio_url: draft.audio_url?.trim() || undefined,
      answer_type: "multiple_choice",
    }
    saveCustomQuestion(newQuestion)
    setSuccessNotice(`Berhasil! Soal Nomor ${selectedPos} telah diperbarui dan tersimpan di bank soal lokal.`)
  }
return (
    <main className="min-h-dvh bg-[#F8FAFC] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 sm:px-8">
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
            <p className="mt-1 text-xs text-slate-500">Ujian tersimpan lokal</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Rata-rata Skor</span>
              <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><Sparkles size={18} /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{avgScore}</p>
            <p className="mt-1 text-xs text-slate-500">Skor rata-rata peserta</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Skor Tertinggi</span>
              <span className="grid size-9 place-items-center rounded-xl bg-[#FFF7E8] text-[#C5A059]"><BookOpenCheck size={18} /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-[#006C35]">{maxScore}</p>
            <p className="mt-1 text-xs text-slate-500">Hasil terbaik sejauh ini</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Level Terbaru</span>
              <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-[#006C35]"><ShieldCheck size={18} /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{latestResult ? `CEFR ${latestResult.cefr}` : "—"}</p>
            <p className="mt-1 text-xs text-slate-500">{latestResult ? formatDate(latestResult.completedAt) : "Belum ada sesi"}</p>
          </div>
        </section>

        {/* Unified Navigation Tabs */}
        <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3 overflow-x-auto no-scrollbar lg:flex-nowrap scroll-smooth -mx-5 px-5 sm:mx-0 sm:px-0 shrink-0">
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
            <History size={17} /> Riwayat Saya {history.length > 0 && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs tabular-nums">{history.length}</span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ai_discussion")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.96] ${
              activeTab === "ai_discussion" ? "bg-[#006C35] text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <MessageSquareText size={17} /> Diskusi AI
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
                className={"inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.96] " + (activeTab === "question_bank" ? "bg-amber-800 text-white shadow-sm" : "bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100")}
              >
                <BookOpenCheck size={17} /> Input &amp; Revisi Soal
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("bundle_upload")}
                className={"inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.96] " + (activeTab === "bundle_upload" ? "bg-amber-800 text-white shadow-sm" : "bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100")}
              >
                <Upload size={17} /> Upload Bundle Soal (JSON &amp; Audio)
              </button>
            </>
          )}
        </div>

        {/* Tab 1: Format Ujian / Main Hero */}
        {activeTab === "packages" && (
          <div className="mt-6 space-y-8">
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
                  onClick={() => {
                    if (hasActiveSession) {
                      posthog.capture("exam_resumed", { exam_id: demoExam.id, mode: "local" })
                      navigate({ to: "/exam" })
                    } else {
                      navigate({ to: "/instructions" })
                    }
                  }}
                  disabled={demoQuotaExhausted}
                  className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#006C35] shadow-sm transition-transform active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {hasActiveSession ? <TimerReset size={18} /> : <PlayCircle size={18} />}
                  {hasActiveSession ? "Lanjutkan ujian" : demoQuotaExhausted ? "Kuota habis" : "Mulai simulasi"}
                  <ArrowRight size={17} />
                </button>
              </div>
              <div className="grid content-end gap-3 sm:grid-cols-3 md:grid-cols-1">
                <HeroMetric icon={<Clock3 size={19} />} label="Durasi" value={`${demoExam.durationMinutes} menit`} />
                <HeroMetric icon={<ListChecks size={19} />} label="Jumlah soal" value={`${demoExam.questions.length + customQuestions.length} soal`} />
                <HeroMetric icon={<Headphones size={19} />} label="Audio" value="Maks. 2x" />
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
              <div className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100 sm:p-7">
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
                    <div className="flex items-center gap-2">
                      <TierBadge tier="free" />
                      <span className="rounded-lg bg-[#E6F0EB] px-3 py-1.5 text-xs font-bold text-[#006C35]">Full Test</span>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-2"><Clock3 size={16} /> {demoExam.durationMinutes} menit</span>
                    <span className="inline-flex items-center gap-2"><ListChecks size={16} /> 6 seksi · {demoExam.questions.length + customQuestions.length} nomor</span>
                  </div>
                  {freeAttemptsLeft >= 0 && (
                    <p className={`mt-3 text-sm ${freeAttemptsLeft === 0 ? "font-semibold text-red-700" : "text-slate-600"}`}>
                      {freeAttemptsLeft === 0
                        ? "Kuota percobaan gratis habis (maksimal 2 kali)."
                        : `Sisa percobaan gratis: ${freeAttemptsLeft} dari ${FREE_ATTEMPT_LIMIT}`}
                    </p>
                  )}
                </article>
              </div>

              <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#FFF7E8] text-[#C5A059]"><History size={20} /></span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Riwayat terakhir</p>
                    <p className="text-xs text-slate-500">Tersimpan di perangkat</p>
                  </div>
                </div>
                {latestResult ? (
                  <div className="mt-7 flex items-end justify-between">
                    <div>
                      <p className="text-4xl font-bold tabular-nums text-[#006C35]">{latestResult.score}</p>
                      <p className="mt-1 text-sm text-slate-500">{formatDate(latestResult.completedAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAttempt(latestResult)}
                      className="rounded-xl bg-[#E6F0EB] px-3 py-2 text-sm font-bold text-[#006C35] transition-transform active:scale-[0.96]"
                    >
                      {latestResult.cefr} · Pembahasan
                    </button>
                  </div>
                ) : (
                  <div className="mt-7 rounded-2xl bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">Belum ada hasil. Selesaikan simulasi untuk melihat perkembanganmu.</div>
                )}
              </section>
            </section>
          </div>
        )}

        {/* Tab 2: Riwayat Ujian Saya */}
        {activeTab === "my_history" && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Riwayat Ujian Saya</h2>
                <p className="mt-1 text-sm text-slate-600">Daftar sesi latihan yang pernah kamu ikuti beserta skor dan pembahasannya.</p>
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

            {filteredHistory.length === 0 ? (
              <div className="mt-8 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
                <History className="mx-auto text-slate-400 mb-2" size={32} />
                {history.length === 0 ? "Belum ada riwayat ujian." : "Tidak ada riwayat yang cocok dengan pencarian."}
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
                      <th className="py-3 px-4">Tanggal Selesai</th>
                      <th className="py-3 px-4">Paket Ujian</th>
                      <th className="py-3 px-4 text-center">Jawaban Benar</th>
                      <th className="py-3 px-4 text-center">Skor Akhir</th>
                      <th className="py-3 px-4 text-center">CEFR Level</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-4 font-medium text-slate-900 tabular-nums">{formatDate(item.completedAt)}</td>
                        <td className="py-4 px-4 font-semibold text-slate-700">{demoExam.title}</td>
                        <td className="py-4 px-4 text-center tabular-nums font-semibold text-slate-600">{item.correctCount} / {item.totalQuestions}</td>
                        <td className="py-4 px-4 text-center font-bold tabular-nums text-lg text-[#006C35]">{item.score}</td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-block rounded-lg bg-[#E6F0EB] px-2.5 py-1 text-xs font-bold text-[#006C35]">{item.cefr}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedAttempt(item)}
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

        {activeTab === "ai_discussion" && <AiDiscussionGate tier={auth.tier} />}

      {/* Tab 3 (Admin): History Semua User */}
      {isAdmin && activeTab === "all_history" && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-amber-100 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 mb-1">Portal Admin</div>
                <h2 className="text-xl font-bold text-slate-900">History Semua User</h2>
                <p className="mt-1 text-sm text-slate-600">Pantau hasil pengerjaan seluruh peserta terdaftar.</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="text"
                  placeholder="Cari nama/email/skor..."
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
                    <th className="py-3 px-4">Nama Peserta</th>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4 text-center">Jawaban Benar</th>
                    <th className="py-3 px-4 text-center">Skor</th>
                    <th className="py-3 px-4 text-center">CEFR</th>
                    <th className="py-3 px-4 text-right">Aksi Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAllAttempts.map((item) => (
                    <tr key={item.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="py-4 px-4">
                        <p className="font-bold text-slate-900">{item.userName}</p>
                        <p className="text-xs text-slate-500">{item.userEmail}</p>
                      </td>
                      <td className="py-4 px-4 font-medium text-slate-700 tabular-nums">{formatDate(item.completedAt)}</td>
                      <td className="py-4 px-4 text-center tabular-nums text-slate-600">{item.correctCount} / {item.totalQuestions}</td>
                      <td className="py-4 px-4 text-center font-bold tabular-nums text-lg text-amber-800">{item.score}</td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-block rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{item.cefr}</span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedAttempt(item as unknown as SessionResult)}
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
         <UserManagement
           mode="demo"
           currentAuth={{
             userId: auth.userId || "demo-user",
             displayName: auth.displayName || "Peserta Demo",
             role: auth.role,
             setRole: auth.setRole,
             tier: auth.tier,
             setTier: auth.setTier,
           }}
           demoHistory={history}
            onInspectAttempt={(attId) => {
              const found = history.find((h) => h.id === attId)
              if (found) setSelectedAttempt(found)
            }}
          />
       )}

        {/* Tab 5 (Admin): Input & Revisi Soal */}
        {isAdmin && activeTab === "question_bank" && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-amber-100 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 mb-1">Editor Bank Soal Demo</div>
                <h2 className="text-xl font-bold text-slate-900">Input & Revisi Soal Bahasa Arab</h2>
                <p className="mt-1 text-sm text-slate-600">Pilih nomor soal untuk memuat data lama secara otomatis, edit, lalu simpan perubahan.</p>
              </div>
            </div>

            {/* Success Notification Banner */}
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

            {/* Selection Controls: Package & Question Position */}
            <div className="mt-6 grid gap-4 rounded-2xl bg-amber-50/50 p-5 border border-amber-200 sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-900">
                1. Paket Ujian
                <select disabled className="mt-1.5 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm">
                  <option>{demoExam.title} (Demo Full Test)</option>
                </select>
              </label>

              <label className="block text-xs font-bold uppercase tracking-wider text-amber-900">
                2. Pilih Nomor Soal (Auto-Load Data)
                <select
                  value={selectedPos}
                  onChange={(e) => handleSelectQuestionPosition(parseInt(e.target.value, 10) || 1)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm"
                >
                  {allDemoQuestions.map((q, idx) => (
                    <option key={q.id} value={idx + 1}>
                      Nomor {idx + 1} ({q.section.toUpperCase()}) — {q.question.slice(0, 30)}...
                    </option>
                  ))}
                  <option value={allDemoQuestions.length + 1}>
                    + Tambah Soal Baru (Nomor {allDemoQuestions.length + 1})
                  </option>
                </select>
              </label>
            </div>

            {/* Form Editor */}
            <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <form onSubmit={handleSaveQuestion} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                  <span className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                    {draft.id ? `Mode: Edit Soal Nomor ${selectedPos} (ID: ${draft.id})` : `Mode: Tambah Soal Baru Nomor ${selectedPos}`}
                  </span>
                  {draft.id && (
                    <span className="text-xs font-semibold text-slate-500">Data lama dimuat otomatis</span>
                  )}
                </div>

                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Kompetensi / Seksi
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

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Teks Passage / Bacaan (Opsional)
                  <textarea
                    dir="rtl"
                    value={draft.passage || ""}
                    onChange={(e) => setDraft({ ...draft, passage: e.target.value })}
                    placeholder="أدخل النص القرائي هنا إن وجد..."
                    className="font-arabic mt-1.5 min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-base text-right"
                  />
                </label>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Teks Pertanyaan (Arab RTL)
                  <textarea
                    dir="rtl"
                    value={draft.question || ""}
                    onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                    placeholder="أدخل السؤال هنا..."
                    className="font-arabic mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-lg text-right font-medium"
                  />
                </label>

                <fieldset className="mt-4">
                  <legend className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Opsi Jawaban & Kunci <span className="font-normal text-slate-500">(pilih radio button untuk menentukan kunci)</span>
                  </legend>
                  <div className="mt-2 space-y-2.5">
                    {draft.options?.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="correct_index"
                          checked={draft.correct_index === i}
                          onChange={() => setDraft({ ...draft, correct_index: i })}
                          className="size-4 accent-[#006C35]"
                        />
                        <span className="text-xs font-bold text-slate-500 w-5">{optionLetters[i]}</span>
                        <input
                          dir="rtl"
                          value={opt}
                          onChange={(e) => {
                            const currentOpts = draft.options || ["", "", "", ""]
                            const newOpts: [string, string, string, string] = [currentOpts[0] || "", currentOpts[1] || "", currentOpts[2] || "", currentOpts[3] || ""]
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
                  Pembahasan Kunci
                  <textarea
                    value={draft.explanation || ""}
                    onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                    placeholder="Jelaskan alasan mengapa opsi kunci adalah jawaban yang tepat..."
                    className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6"
                  />
                </label>

                {questionMsg ? <p className="mt-3 rounded-xl bg-red-100 p-3 text-xs font-bold text-red-900">{questionMsg}</p> : null}

                <div className="mt-5 flex gap-3">
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white transition-transform active:scale-[0.96]"
                  >
                    <Save size={17} /> Simpan Perubahan Soal
                  </button>
                </div>
              </form>

              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Daftar Soal</h3>
                  <span className="text-xs font-bold text-slate-500 tabular-nums">{allDemoQuestions.length} Soal Total</span>
                </div>

                <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {allDemoQuestions.map((q, idx) => (
                    <article
                      key={q.id}
                      onClick={() => handleSelectQuestionPosition(idx + 1)}
                      className={`cursor-pointer rounded-xl border p-4 transition-all ${
                        selectedPos === idx + 1 ? "border-[#006C35] bg-[#E6F0EB]/30 ring-2 ring-[#006C35]" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-[#006C35]">No {idx + 1} · {q.section}</span>
                          <p dir="rtl" className="font-arabic mt-1.5 text-base text-right leading-7">{q.question}</p>
                          <p className="mt-1 text-xs text-slate-500">Kunci: Opsi {optionLetters[q.correct_index]} ({q.options[q.correct_index]})</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-[#006C35]"
                          >
                            Edit
                          </button>
                          {q.id.startsWith("q_custom_") && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); deleteCustomQuestion(q.id); }}
                              className="rounded-lg p-1 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {isAdmin && activeTab === "bundle_upload" && (
          <div className="mt-6">
            <AdminBundleUploader
              client={null}
              mode="demo"
            />
          </div>
        )}

      </div>

      {/* Review Modal for inspecting attempts */}
      {selectedAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl max-h-[90dvh] overflow-y-auto sm:p-8">
            <button
              type="button"
              onClick={() => setSelectedAttempt(null)}
              className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={20} />
            </button>

            <div className="border-b border-slate-100 pb-4">
              <span className="rounded-md bg-[#E6F0EB] px-2.5 py-1 text-xs font-bold text-[#006C35]">Review Pembahasan Sesi Ujian</span>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">{demoExam.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                <span>Skor Akhir: <strong className="text-[#006C35] text-base">{selectedAttempt.score}</strong></span>
                <span>Level CEFR: <strong className="text-amber-800 font-bold">{selectedAttempt.cefr}</strong></span>
                <span>Tanggal: {formatDate(selectedAttempt.completedAt)}</span>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {demoExam.questions.map((q, idx) => (
                <div key={q.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#006C35]">Soal {idx + 1} · {q.section}</span>
                    <span className="text-xs text-slate-500 font-semibold">Pembahasan Terdaftar</span>
                  </div>
                  <p dir="rtl" className="font-arabic text-right text-lg leading-8 text-slate-900 mb-3">{q.question}</p>
                  <div className="grid gap-2">
                    {(Array.isArray(q.options) ? q.options : []).map((opt: string, oIdx: number) => {
                      const isCorrectKey = oIdx === q.correct_index
                      return (
                        <div
                          key={oIdx}
                          dir="rtl"
                          className={`flex items-center justify-between rounded-xl border p-3 font-arabic text-base ${
                            isCorrectKey ? "border-green-300 bg-green-50 text-green-900 font-bold" : "border-slate-100 text-slate-700"
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
                onClick={() => setSelectedAttempt(null)}
                className="rounded-xl bg-[#006C35] px-5 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.96]"
              >
                Tutup Pembahasan
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function QuestionBankPage() {
  const navigate = useNavigate()
  return (
    <main className="min-h-dvh bg-[#F8FAFC] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Brand />
          <Link to="/" className="text-sm font-bold text-slate-600 hover:text-[#006C35]">Kembali ke Dashboard</Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <p className="text-sm text-slate-500">Kelola soal kini terintegrasi langsung di tab Dashboard Admin.</p>
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#006C35] px-4 py-2.5 text-sm font-bold text-white"
        >
          <ArrowLeft size={16} /> Buka Dashboard Tab Admin
        </button>
      </div>
    </main>
  )
}

function InstructionsPage() {
  const navigate = useNavigate()
  const auth = useAppAuth()
  const startExam = useExamStore((state) => state.startExam)
  const activeExamId = useExamStore((state) => state.activeExamId)
  const submittedAt = useExamStore((state) => state.submittedAt)
  const historyState = useExamStore((state) => state.history)
  const history = useMemo(() => historyState || [], [historyState])
  const resuming = activeExamId === demoExam.id && !submittedAt
  const usedFreeAttempts = history.filter((item) => item.examId === demoExam.id).length
  const freeAttemptsLeft = freeAttemptsRemaining(auth.tier, usedFreeAttempts, auth.role === "admin")
  const quotaExhausted = !resuming && freeAttemptsLeft === 0

  const start = () => {
    if (quotaExhausted) return
    if (!resuming) {
      startExam(demoExam.id, demoExam.durationMinutes)
      posthog.capture("exam_started", { exam_id: demoExam.id, mode: "local", total_questions: demoExam.questions.length, duration_minutes: demoExam.durationMinutes })
    } else {
      posthog.capture("exam_resumed", { exam_id: demoExam.id, mode: "local" })
    }
    navigate({ to: "/exam" })
  }

  return (
    <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 transition-colors hover:text-[#006C35]">
          <ArrowLeft size={17} /> Kembali ke dashboard
        </Link>
        <section className="mt-5 rounded-3xl bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_35px_rgba(15,23,42,0.06)] border border-slate-100 sm:p-9">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#E6F0EB] text-[#006C35]"><ShieldCheck size={24} /></span>
          <p className="mt-6 text-sm font-bold text-[#006C35]">Sebelum memulai</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 text-balance">Petunjuk simulasi ujian</h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-600 text-pretty">Baca petunjuk berikut. Timer mulai saat kamu menekan tombol mulai dan sesi dapat dilanjutkan apabila browser ter-refresh.</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Instruction icon={<Clock3 />} title="Waktu berjalan" text={`Selesaikan ${demoExam.questions.length} soal dalam ${demoExam.durationMinutes} menit.`} />
            <Instruction icon={<Headphones />} title="Cek audio" text="Setiap audio hanya dapat dimulai paling banyak satu kali." />
            <Instruction icon={<Bookmark />} title="Tandai ragu" text="Gunakan ikon bookmark untuk kembali ke soal yang perlu diperiksa." />
            <Instruction icon={<Send />} title="Kirim jawaban" text="Jawaban terkirim otomatis saat waktu habis." />
          </div>

          <div className="mt-8 rounded-2xl border border-amber-100 bg-[#FFF9ED] p-4 text-sm leading-6 text-[#8A5A12]">
            <span className="font-bold">Catatan:</span> ini adalah simulasi latihan. Hasil tersimpan hanya di browser perangkat ini.
          </div>
          {freeAttemptsLeft >= 0 && (
            <p className={`mt-5 rounded-xl px-4 py-3 text-sm font-semibold ${quotaExhausted ? "bg-red-50 text-red-700" : "bg-[#E6F0EB] text-[#006C35]"}`}>
              {quotaExhausted
                ? "Kuota percobaan gratis untuk paket ini sudah habis (maksimal 2 kali)."
                : `Sisa percobaan gratis: ${freeAttemptsLeft} dari ${FREE_ATTEMPT_LIMIT}.`}
            </p>
          )}
          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link to="/" className="inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100">Batal</Link>
            <button type="button" onClick={start} disabled={quotaExhausted} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white shadow-sm transition-[transform,background-color] active:scale-[0.96] hover:bg-[#00572B] disabled:cursor-not-allowed disabled:opacity-50">
              <PlayCircle size={18} /> {quotaExhausted ? "Kuota habis" : resuming ? "Lanjutkan simulasi" : "Saya siap, mulai ujian"}
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
  const setCurrentIndex = useExamStore((state) => state.setCurrentIndex)
  const answerQuestion = useExamStore((state) => state.answerQuestion)
  const toggleBookmark = useExamStore((state) => state.toggleBookmark)
  const completeExam = useExamStore((state) => state.completeExam)

  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const completingRef = useRef(false)
  const [isMobileGridOpen, setIsMobileGridOpen] = useState(false)
  const [isPassageExpanded, setIsPassageExpanded] = useState(true)

  const customQuestionsState = useExamStore((state) => state.customQuestions)
  const customQuestions = useMemo(() => customQuestionsState || [], [customQuestionsState])
  const questions = useMemo(() => [...demoExam.questions, ...(customQuestions || [])], [customQuestions])

  useEffect(() => {
    if (completingRef.current) return
    if (activeExamId !== demoExam.id || submittedAt || !endsAt) {
      navigate({ to: "/", replace: true })
      return
    }

    const tick = () => {
      const remaining = calculateRemainingSeconds(endsAt)
      setRemainingSeconds(remaining)
      if (remaining === 0 && !completingRef.current) {
        completingRef.current = true
        const result = createSessionResult({ ...demoExam, questions }, answers, "timeout")
        completeExam(result)
        posthog.capture("exam_finished", { exam_id: demoExam.id, score: result.score, reason: "timeout" })
        navigate({ to: "/results", replace: true })
      }
    }

    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [activeExamId, answers, completeExam, endsAt, navigate, questions, submittedAt])

  const currentQuestion = questions[currentIndex] || questions[0]

  const handleFinish = (reason: ExamFinishReason = "manual") => {
    if (completingRef.current) return
    completingRef.current = true
    const result = createSessionResult({ ...demoExam, questions }, answers, reason)
    completeExam(result)
    posthog.capture("exam_finished", { exam_id: demoExam.id, score: result.score, reason })
    navigate({ to: "/results", replace: true })
  }

  if (!currentQuestion) return null

  return (
    <main className="min-h-dvh bg-[#F8FAFC] text-slate-900 flex flex-col">
      <header className="border-b border-slate-200/80 bg-white sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
          <Brand />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-1.5 text-sm font-bold tabular-nums text-slate-700">
              <Clock3 size={16} className="text-[#006C35]" />
              {formatTime(remainingSeconds)}
            </div>
            <button
              type="button"
              onClick={() => handleFinish("manual")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition-transform active:scale-[0.96] hover:bg-red-700"
            >
              <Send size={14} /> Finish Test
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-6 sm:px-8 sm:py-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg bg-[#E6F0EB] text-sm font-bold text-[#006C35]">{currentIndex + 1}</span>
                <SectionPill section={currentQuestion.section} />
              </div>
              <button
                type="button"
                onClick={() => toggleBookmark(currentQuestion.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  bookmarks.includes(currentQuestion.id) ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Bookmark size={14} fill={bookmarks.includes(currentQuestion.id) ? "currentColor" : "none"} />
                {bookmarks.includes(currentQuestion.id) ? "Ragu-ragu" : "Tandai Ragu"}
              </button>
            </div>

           {currentQuestion.passage && (
              <div className="mt-5 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100/80 border-b border-slate-200/60 lg:hidden">
                  <span className="text-xs font-bold text-slate-700">Teks Bacaan (Qira’ah)</span>
                  <button
                    type="button"
                    onClick={() => setIsPassageExpanded(!isPassageExpanded)}
                    className="text-xs font-bold text-[#006C35] hover:underline"
                  >
                    {isPassageExpanded ? "Ciutkan Teks" : "Tampilkan Teks"}
                  </button>
                </div>
                {isPassageExpanded && (
                  <div dir="rtl" className="font-arabic p-4 text-right text-lg leading-8 text-slate-800">
                    {currentQuestion.passage}
                  </div>
                )}
              </div>
            )}

            <div dir="rtl" className="font-arabic mt-6 text-right">
              <h2 className="text-xl font-medium leading-9 text-slate-900">{currentQuestion.question}</h2>
              <div className="mt-6 grid gap-3">
                {currentQuestion.options.map((option, optionIdx) => {
                  const isSelected = answers[currentQuestion.id] === optionIdx
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => answerQuestion(currentQuestion.id, optionIdx)}
                      className={`flex min-h-[52px] items-center justify-between rounded-2xl border p-4 text-right transition-all active:scale-[0.98] ${
                        isSelected
                          ? "border-[#006C35] bg-[#E6F0EB]/50 text-[#006C35] font-bold shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-lg">{option}</span>
                      <span className={`grid size-8 place-items-center rounded-xl text-xs font-bold font-sans ${isSelected ? "bg-[#006C35] text-white" : "bg-slate-100 text-slate-600"}`}>
                        {optionLetters[optionIdx]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-8 hidden items-center justify-between border-t border-slate-100 pt-5 lg:flex">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(currentIndex - 1, questions[currentIndex - 1]?.id || "")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
            >
              <ChevronLeft size={18} /> Sebelumnya
            </button>

            <button
              type="button"
              disabled={currentIndex === questions.length - 1}
              onClick={() => setCurrentIndex(currentIndex + 1, questions[currentIndex + 1]?.id || "")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#006C35] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40 transition-transform active:scale-[0.96]"
            >
              Berikutnya <ArrowRight size={18} />
            </button>
          </div>
        </section>

        <aside className="hidden rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100 lg:block">
          <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-3">Navigasi Soal</h3>
          <QuestionGrid
            questions={questions}
            activeIndex={currentIndex}
            answers={answers}
            bookmarks={bookmarks}
            viewedQuestionIds={viewedQuestionIds}
            onSelect={(idx) => setCurrentIndex(idx, questions[idx]?.id || "")}
          />
        </aside>
      </div>

      {/* Mobile Sticky Bottom Navigation Bar */}
      <div className="sticky bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 shadow-lg lg:hidden pb-safe flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex(currentIndex - 1, questions[currentIndex - 1]?.id || "")}
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
          <span>Soal {currentIndex + 1}/{questions.length}</span>
        </button>

        <button
          type="button"
          onClick={() => toggleBookmark(currentQuestion.id)}
          className={`inline-flex min-h-11 items-center justify-center rounded-xl p-2.5 text-xs font-bold transition-all ${
            bookmarks.includes(currentQuestion.id) ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-slate-100 text-slate-600"
          }`}
          aria-label="Tandai Ragu"
        >
          <Bookmark size={16} fill={bookmarks.includes(currentQuestion.id) ? "currentColor" : "none"} />
        </button>

        <button
          type="button"
          disabled={currentIndex === questions.length - 1}
          onClick={() => setCurrentIndex(currentIndex + 1, questions[currentIndex + 1]?.id || "")}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-[#006C35] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40 active:scale-[0.96]"
        >
          Next <ArrowRight size={16} />
        </button>
      </div>

      {/* Mobile Question Grid Drawer Modal */}
      {isMobileGridOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/60 backdrop-blur-xs lg:hidden">
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
              activeIndex={currentIndex}
              answers={answers}
              bookmarks={bookmarks}
              viewedQuestionIds={viewedQuestionIds}
              onSelect={(idx) => {
                setCurrentIndex(idx, questions[idx]?.id || "")
                setIsMobileGridOpen(false)
              }}
            />
          </div>
        </div>
      )}
    </main>
  )
}

function ResultsPage() {
  const navigate = useNavigate()
  const historyState = useExamStore((state) => state.history)
  const history = useMemo(() => historyState || [], [historyState])
  const latestResult = history[0]

  if (!latestResult) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#F8FAFC] p-5">
        <div className="text-center">
          <p className="text-slate-500">Belum ada hasil ujian.</p>
          <button type="button" onClick={() => navigate({ to: "/" })} className="mt-4 rounded-xl bg-[#006C35] px-4 py-2 text-sm font-bold text-white">Kembali ke Dashboard</button>
        </div>
      </main>
    )
  }

  const chartData = (["listening", "reading", "grammar", "structures", "writing", "speaking"] as Section[]).map((s) => ({
    name: sectionCopy[s].label,
    description: sectionCopy[s].description,
    score: latestResult.sectionScores[s] || 0,
  }))

  return (
    <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 text-slate-900 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Brand />
        <section className="mt-7 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-3xl bg-[#006C35] p-8 text-white shadow-[0_18px_45px_rgba(0,108,53,0.20)]">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/13"><Check size={25} /></span>
            <p className="mt-6 text-sm font-bold text-emerald-100">Simulasi selesai</p>
            <h1 className="mt-2 text-3xl font-bold">Hasil latihanmu</h1>
            <div className="mt-8 flex items-end gap-4">
              <span className="text-6xl font-bold tabular-nums">{latestResult.score}</span>
              <span className="mb-2 text-emerald-100">/ 100</span>
            </div>
            <div className="mt-7 flex justify-between rounded-2xl bg-white/10 px-4 py-4">
              <span className="text-sm text-emerald-50">Level perkiraan</span>
              <span className="rounded-lg bg-[#C5A059] px-3 py-1.5 text-sm font-bold text-[#17321F]">CEFR {latestResult.cefr}</span>
            </div>
            <p className="mt-5 text-sm leading-6 text-emerald-50/85">{latestResult.correctCount} dari {latestResult.totalQuestions} soal dijawab benar.</p>
          </div>
          <section className="rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)] border border-slate-100 sm:p-8">
            <p className="text-sm font-bold text-[#006C35]">Analisis kompetensi</p>
            <h2 className="mt-1 text-xl font-bold">Performa per seksi</h2>
            <div className="mt-4 h-72">
              <Suspense fallback={<div className="h-full rounded-xl bg-slate-100" />}>
                <PerformanceChart data={chartData} />
              </Suspense>
            </div>
          </section>
        </section>
        <div className="mt-6 flex justify-between">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-100"><ArrowLeft size={17} /> Dashboard</Link>
          <Link to="/review" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white transition-transform active:scale-[0.96]"><BookOpenCheck size={17} /> Tinjau pembahasan</Link>
        </div>
      </div>
    </main>
  )
}

function ReviewPage() {
  const navigate = useNavigate()
  const historyState = useExamStore((state) => state.history)
  const history = useMemo(() => historyState || [], [historyState])
  const answers = useExamStore((state) => state.answers) || {}
  const latestResult = history[0]

  useEffect(() => {
    if (!latestResult) navigate({ to: "/", replace: true })
  }, [latestResult, navigate])

  if (!latestResult) return null

  return (
    <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 text-slate-900 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link to="/results" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 transition-colors hover:text-[#006C35]">
          <ArrowLeft size={17} /> Kembali ke hasil
        </Link>
        <div className="mt-5 rounded-3xl bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_rgba(15,23,42,0.05)] border border-slate-100 sm:p-8">
          <p className="text-sm font-bold text-[#006C35]">Mode tinjau</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 text-balance">Jawaban dan pembahasan</h1>
          <p className="mt-3 text-slate-600">Bandingkan jawabanmu dengan kunci lalu gunakan pembahasan untuk memperbaiki strategi.</p>
        </div>

        <div className="mt-6 space-y-5">
          {demoExam.questions.map((question, index) => {
            const answer = answers[question.id]
            const isCorrect = answer === question.correct_index
            return (
              <article key={question.id} className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_22px_rgba(15,23,42,0.04)] border border-slate-100">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-700">{index + 1}</span>
                    <SectionPill section={question.section} />
                  </div>
                  <span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isCorrect ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {isCorrect ? "Benar" : answer === undefined ? "Tidak dijawab" : "Perlu ditinjau"}
                  </span>
                </div>
                <div dir="rtl" className="p-5 font-arabic text-right sm:p-6">
                  <h2 className="text-[20px] font-medium leading-[1.85] text-slate-900">{question.question}</h2>
                  <div className="mt-5 grid gap-2.5">
                    {question.options.map((option, optionIndex) => {
                      const isAnswer = answer === optionIndex
                      const isKey = question.correct_index === optionIndex
                      return (
                        <div
                          key={option}
                          className={`flex items-center gap-3 rounded-xl border p-3.5 text-[17px] leading-8 ${
                            isKey ? "border-green-200 bg-green-50 text-green-900" : isAnswer ? "border-red-200 bg-red-50 text-red-900" : "border-slate-100 text-slate-600"
                          }`}
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white text-xs font-bold shadow-sm font-sans">{optionLetters[optionIndex]}</span>
                          <span>{option}</span>
                          {isKey && <Check className="mr-auto size-4 text-green-700 font-sans" />}
                          {isAnswer && !isKey && <TriangleAlert className="mr-auto size-4 text-red-600 font-sans" />}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="border-t border-slate-100 bg-[#FFFCF4] px-5 py-4 text-sm leading-6 text-slate-700 sm:px-6">
                  <span className="font-bold text-[#8A5A12]">Pembahasan: </span>
                  {question.explanation.replace(/^Pembahasan:\s*/i, "")}
                </div>
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
      <span>
        <span className="block text-sm font-bold tracking-tight text-slate-900">Hamza Test</span>
        <span className="block text-xs font-semibold text-slate-500">Simulation</span>
      </span>
    </Link>
  )
}

function HeroMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-emerald-50/80">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="mt-1.5 text-sm font-bold text-white">{value}</p>
    </div>
  )
}

function Instruction({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <span className="text-[#006C35]">{icon}</span>
      <p className="mt-3 text-sm font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function SectionPill({ section }: { section: Section }) {
  return <span className="rounded-md bg-[#E6F0EB] px-2.5 py-1 text-xs font-bold text-[#006C35]">{sectionCopy[section].label}</span>
}

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(timestamp)
}
