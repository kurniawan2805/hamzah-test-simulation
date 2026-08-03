import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpenCheck, Brain, Check, MessageSquareText, RotateCcw, Send, Sparkles, TriangleAlert } from 'lucide-react'
import type { AiStudyAdapter, AiQuizQuestion, AiTopicState } from '../lib/ai-study'
import type { AiStudyQuota } from '../lib/ai-study-quota'
import { aiTopicById, aiTopics } from '../lib/ai-topics'
import type { Section, UserTier } from '../types'
import { AiDiscussionGate } from './ai-discussion-gate'

const optionLetters = ['أ', 'ب', 'ج', 'د'] as const

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A059] focus:outline-none'

type AiStudyTabProps = {
  tier: UserTier
  isAdmin: boolean
  adapter: AiStudyAdapter
  preselectedTopicId?: string
}

function sectionOf(topicId: string): Section {
  return aiTopicById(topicId)?.section ?? 'grammar'
}

function errorMessage(reason: unknown): string {
  if (reason && typeof reason === 'object' && 'message' in reason) return String(reason.message)
  return 'Terjadi kesalahan. Coba lagi.'
}

export function AiStudyTab({ tier, isAdmin, adapter, preselectedTopicId }: AiStudyTabProps) {
  const canUse = tier === 'vip_plus' || isAdmin
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(() =>
    preselectedTopicId && aiTopicById(preselectedTopicId) ? preselectedTopicId : null,
  )
  const [topicState, setTopicState] = useState<AiTopicState | null>(null)
  const [quota, setQuota] = useState<AiStudyQuota | null>(null)
  const [loading, setLoading] = useState(() => Boolean(selectedTopicId))
  const [error, setError] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [quizIndex, setQuizIndex] = useState(0)

  const topicsBySection = useMemo(
    () => ({
      grammar: aiTopics.filter((topic) => topic.section === 'grammar'),
      structures: aiTopics.filter((topic) => topic.section === 'structures'),
    }),
    [],
  )

  useEffect(() => {
    void adapter.loadQuota().then(setQuota).catch(() => {})
  }, [adapter])

  useEffect(() => {
    if (!selectedTopicId) return
    let cancelled = false
    const topicId = selectedTopicId
    void adapter
      .loadTopicState(topicId, sectionOf(topicId))
      .then((state) => {
        if (!cancelled) setTopicState(state)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [adapter, selectedTopicId])

  const run = async (action: () => Promise<AiTopicState>) => {
    setLoading(true)
    setError('')
    try {
      setTopicState(await action())
      setQuota(await adapter.loadQuota())
    } catch (reason: unknown) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  const openTopic = (topicId: string) => {
    setSelectedTopicId(topicId)
    setTopicState(null)
    setError('')
    setLoading(true)
    setQuizIndex(0)
  }

  const backToTopics = () => {
    setSelectedTopicId(null)
    setTopicState(null)
    setLoading(false)
    setError('')
  }

  const handleSelectAnswer = (questionIndex: number, optionIndex: number) => {
    if (!topicState?.quiz || !selectedTopicId) return
    const answers = [...topicState.quizAnswers]
    answers[questionIndex] = optionIndex
    const next = { ...topicState, quizAnswers: answers }
    setTopicState(next)
    void adapter
      .saveQuizAnswers(selectedTopicId, topicState.quiz.id, answers)
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }

  const handleSubmitQuiz = () => {
    const quiz = topicState?.quiz
    if (!quiz || !selectedTopicId) return
    void run(() => adapter.gradeQuiz(selectedTopicId, quiz.id, topicState?.quizAnswers ?? []))
  }

  const handleSendChat = () => {
    const message = chatDraft.trim()
    if (!message || !selectedTopicId || loading) return
    setChatDraft('')
    void run(() => adapter.sendChat(selectedTopicId, sectionOf(selectedTopicId), message))
  }

  if (!canUse) return <AiDiscussionGate tier={tier} />

  const topic = selectedTopicId ? aiTopicById(selectedTopicId) : undefined

  return (
    <section className="mx-auto mt-8 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-[#006C35]">
            <Brain size={17} /> Belajar Topik dengan AI
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Materi, kuis, dan diskusi satu topik.</h2>
        </div>
        {quota && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[#E6F0EB] px-3 py-1.5 font-bold text-[#006C35]">Pesan: {quota.messagesRemaining}/30</span>
            <span className="rounded-full bg-[#FFF7E8] px-3 py-1.5 font-bold text-[#8A5A12]">Kuis: {quota.quizzesRemaining}/10</span>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
          <TriangleAlert size={17} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {!selectedTopicId || !topic ? (
        <div className="mt-6 space-y-7">
          {(['grammar', 'structures'] as const).map((section) => (
            <div key={section}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                {section === 'grammar' ? 'Grammar' : 'Structures'}
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {topicsBySection[section].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openTopic(item.id)}
                    className={`group rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] transition-all hover:border-[#C5A059] hover:shadow-[0_14px_36px_rgba(15,23,42,0.08)] active:scale-[0.98] ${focusRing}`}
                  >
                    <span className="text-lg font-bold text-[#006C35]" dir="rtl">
                      {item.arabicTitle}
                    </span>
                    <span className="mt-1 block font-bold text-slate-900">{item.title}</span>
                    <span className="mt-1.5 block text-sm leading-6 text-slate-600">{item.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100 sm:p-7">
            <button
              type="button"
              onClick={backToTopics}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-[#006C35] ${focusRing}`}
            >
              <ArrowLeft size={16} /> Semua topik
            </button>
            <div className="mt-3">
              <h3 className="text-2xl font-bold text-slate-900" dir="rtl">
                {topic.arabicTitle}
              </h3>
              <p className="mt-1 font-bold text-[#006C35]">{topic.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{topic.description}</p>
            </div>
          </div>

          <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100 sm:p-7">
            <div className="flex items-center gap-2">
              <MessageSquareText size={19} className="text-[#006C35]" />
              <h3 className="text-lg font-bold text-slate-900">Materi & Diskusi</h3>
            </div>

            {!topicState?.lessonLoaded ? (
              <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-center">
                <p className="text-sm leading-6 text-slate-600">
                  Mulai dengan penjelasan ringkas topik ini, lalu lanjut kuis dan tanya jawab.
                </p>
                <button
                  type="button"
                  onClick={() => void run(() => adapter.loadLesson(topic.id, sectionOf(topic.id)))}
                  disabled={loading || Boolean(quota?.messagesExhausted)}
                  className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-5 py-3 text-sm font-bold text-white transition-transform active:scale-[0.96] hover:bg-[#005A2D] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                >
                  <Sparkles size={16} /> {loading ? 'Memuat materi…' : 'Mulai belajar topik ini'}
                </button>
                {quota?.messagesExhausted && (
                  <p className="mt-3 text-xs font-semibold text-red-700">Kuota pesan harian sudah habis. Coba lagi besok.</p>
                )}
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="max-h-80 space-y-4 overflow-y-auto pr-1">
                  {topicState.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                          message.role === 'user'
                            ? 'bg-[#E6F0EB] text-slate-900'
                            : 'border border-slate-100 bg-slate-50 text-slate-800'
                        }`}
                      >
                        <p className={`mb-1 text-xs font-bold ${message.role === 'user' ? 'text-[#006C35]' : 'text-slate-500'}`}>
                          {message.role === 'user' ? 'Kamu' : 'AI'}
                        </p>
                        <p className="whitespace-pre-wrap" dir="auto">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        handleSendChat()
                      }
                    }}
                    rows={2}
                    placeholder="Tanya AI tentang topik ini…"
                    className="min-h-11 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#006C35] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSendChat}
                    disabled={loading || !chatDraft.trim() || Boolean(quota?.messagesExhausted)}
                    aria-label="Kirim pesan"
                    className={`grid size-11 shrink-0 place-items-center rounded-xl bg-[#006C35] text-white transition-transform active:scale-[0.96] hover:bg-[#005A2D] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                  >
                    <Send size={17} />
                  </button>
                </div>
              </div>
            )}
          </section>

          <QuizSection
            topicId={topic.id}
            topicState={topicState}
            quizIndex={quizIndex}
            setQuizIndex={setQuizIndex}
            loading={loading}
            quota={quota}
            onStartQuiz={() => {
              void run(() => adapter.generateQuiz(topic.id, sectionOf(topic.id))).then(() => setQuizIndex(0))
            }}
            onSelectAnswer={handleSelectAnswer}
            onSubmitQuiz={handleSubmitQuiz}
          />
        </div>
      )}
    </section>
  )
}

type QuizSectionProps = {
  topicId: string
  topicState: AiTopicState | null
  quizIndex: number
  setQuizIndex: (index: number) => void
  loading: boolean
  quota: AiStudyQuota | null
  onStartQuiz: () => void
  onSelectAnswer: (questionIndex: number, optionIndex: number) => void
  onSubmitQuiz: () => void
}

function QuizSection({
  topicId,
  topicState,
  quizIndex,
  setQuizIndex,
  loading,
  quota,
  onStartQuiz,
  onSelectAnswer,
  onSubmitQuiz,
}: QuizSectionProps) {
  const quiz = topicState?.quiz ?? null
  const result = topicState?.quizResult ?? null
  const question: AiQuizQuestion | undefined = quiz?.questions[quizIndex]
  const selected = quiz ? topicState?.quizAnswers[quizIndex] ?? null : null

  return (
    <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-slate-100 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpenCheck size={19} className="text-[#C5A059]" />
          <h3 className="text-lg font-bold text-slate-900">Kuis 5 soal</h3>
        </div>
        {quiz && !result && (
          <span className="rounded-lg bg-[#FFF7E8] px-3 py-1.5 text-xs font-bold tabular-nums text-[#8A5A12]">
            Soal {Math.min(quizIndex + 1, quiz.questions.length)} dari {quiz.questions.length}
          </span>
        )}
      </div>

      {!quiz && (
        <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-center">
          <p className="text-sm leading-6 text-slate-600">
            Soal diambil dari bank bertag topik; bila stok habis, AI membuatkan soal baru.
          </p>
          <button
            type="button"
            onClick={onStartQuiz}
            disabled={loading || Boolean(quota?.quizzesExhausted)}
            className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#006C35] bg-white px-5 py-3 text-sm font-bold text-[#006C35] transition-transform active:scale-[0.96] hover:bg-[#E6F0EB] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
          >
            {loading ? 'Menyiapkan soal…' : 'Mulai kuis 5 soal'}
          </button>
          {quota?.quizzesExhausted && (
            <p className="mt-3 text-xs font-semibold text-red-700">Kuota kuis harian sudah habis. Coba lagi besok.</p>
          )}
        </div>
      )}

      {quiz && !result && question && (
        <div className="mt-5">
          <div dir="rtl" className="rounded-2xl border border-slate-100 bg-[#FCFFFD] p-5 font-arabic text-right">
            <h4 className="text-[20px] font-medium leading-[1.85] text-slate-900">{question.question}</h4>
            <div className="mt-5 grid gap-2.5">
              {question.options.map((option, optionIndex) => {
                const isSelected = selected === optionIndex
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onSelectAnswer(question.index, optionIndex)}
                    className={`flex min-h-11 items-center gap-3 rounded-xl border p-3.5 text-right text-[17px] leading-8 transition-colors ${
                      isSelected
                        ? 'border-[#006C35] border-2 bg-[#E6F0EB] text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-[#006C35]'
                    } ${focusRing}`}
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold shadow-sm ${
                        isSelected ? 'bg-[#006C35] text-white' : 'bg-white text-slate-600'
                      }`}
                    >
                      {optionLetters[optionIndex]}
                    </span>
                    <span>{option}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setQuizIndex(Math.max(0, quizIndex - 1))}
              disabled={quizIndex === 0}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
            >
              <ArrowLeft size={16} /> Sebelumnya
            </button>
            {quizIndex < quiz.questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setQuizIndex(quizIndex + 1)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white hover:bg-[#005A2D] ${focusRing}`}
              >
                Berikutnya <ArrowLeft size={16} className="rotate-180" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmitQuiz}
                disabled={loading}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#C5A059] px-5 text-sm font-bold text-[#17321F] hover:bg-[#B58F4B] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
              >
                <Check size={16} /> {loading ? 'Menilai…' : 'Kumpulkan jawaban'}
              </button>
            )}
          </div>
        </div>
      )}

      {quiz && result && (
        <div className="mt-5">
          <div className="rounded-2xl bg-[#006C35] p-6 text-center text-white">
            <p className="text-sm font-bold text-emerald-100">Skor kuis</p>
            <p className="mt-1 text-5xl font-bold tabular-nums">{result.score}</p>
            <p className="mt-2 text-sm text-emerald-50/85">
              {result.correctCount} dari {result.questions.length} soal benar
            </p>
            <button
              type="button"
              onClick={onStartQuiz}
              disabled={loading || Boolean(quota?.quizzesExhausted)}
              className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#006C35] hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
            >
              <RotateCcw size={15} /> Kuis baru
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {result.questions.map((question) => (
              <div key={`${topicId}-${question.index}`} className="overflow-hidden rounded-2xl border border-slate-100">
                <div dir="rtl" className="bg-[#FCFFFD] p-4 font-arabic text-right">
                  <p className="text-[18px] font-medium leading-[1.8] text-slate-900">{question.question}</p>
                  <div className="mt-3 grid gap-2">
                    {question.options.map((option, optionIndex) => {
                      const isKey = question.correctIndex === optionIndex
                      const isSelected = question.selectedIndex === optionIndex
                      return (
                        <div
                          key={option}
                          className={`flex items-center gap-3 rounded-xl border p-3 text-[16px] leading-7 ${
                            isKey ? 'border-green-200 bg-green-50 text-green-900' : isSelected ? 'border-red-200 bg-red-50 text-red-900' : 'border-slate-100 text-slate-600'
                          }`}
                        >
                          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-white text-[11px] font-bold shadow-sm">
                            {optionLetters[optionIndex]}
                          </span>
                          <span>{option}</span>
                          {isKey && <Check className="mr-auto size-4 text-green-700" />}
                          {isSelected && !isKey && <TriangleAlert className="mr-auto size-4 text-red-600" />}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="border-t border-slate-100 bg-[#FFFCF4] px-4 py-3 text-sm leading-6 text-slate-700">
                  <span className="font-bold text-[#8A5A12]">Pembahasan: </span>
                  {question.explanation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
