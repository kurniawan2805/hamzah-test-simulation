import { Bookmark } from 'lucide-react'
type NavigableQuestion = { id: string; answerType?: string }

interface QuestionGridProps {
  questions: NavigableQuestion[]
  activeIndex: number
  answers: Record<string, number>
  bookmarks: string[]
  viewedQuestionIds: string[]
  onSelect: (index: number) => void
  writingAnswers?: Record<string, string>
  speakingAnswers?: Record<string, string>
}

export function QuestionGrid({ 
  questions, 
  activeIndex, 
  answers, 
  bookmarks, 
  viewedQuestionIds, 
  onSelect, 
  writingAnswers = {},
  speakingAnswers = {} 
}: QuestionGridProps) {
  return (
    <nav aria-label="Navigasi nomor soal" className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Navigasi soal</h2>
          <p className="mt-0.5 text-xs text-slate-500">Pilih nomor untuk berpindah.</p>
        </div>
      <Bookmark size={18} className="text-[#D97706]" aria-hidden="true" />
    </div>
    <div className="mt-4">
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-7 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-5" role="group" aria-label="Daftar nomor soal">
        {questions.map((question, index) => {
          const isAnswered = (question.id in answers) || 
            (writingAnswers[question.id] && writingAnswers[question.id].trim().length > 0) ||
            (speakingAnswers[question.id] && speakingAnswers[question.id].trim().length > 0)
          const isBookmarked = bookmarks.includes(question.id)
          const isViewed = viewedQuestionIds.includes(question.id)
          const isActive = index === activeIndex
          const stateClass = isBookmarked
            ? 'bg-[#D97706] text-white'
            : isAnswered
              ? 'bg-[#006C35] text-white'
              : isViewed
                ? 'bg-slate-100 text-slate-700'
                : 'border border-slate-200 bg-white text-slate-400'

          const statusText = [
            `Soal ${index + 1}`,
            isActive ? 'sedang dibuka' : null,
            isAnswered ? 'sudah dijawab' : 'belum dijawab',
            isBookmarked ? 'ditandai ragu' : null,
          ].filter(Boolean).join(', ')

          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onSelect(index)}
              className={`relative grid aspect-square min-h-10 w-full place-items-center rounded-lg text-xs font-bold transition-[transform,box-shadow,background-color] active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A059] ${stateClass} ${isActive ? 'ring-2 ring-[#006C35] ring-offset-2' : ''}`}
              aria-label={statusText}
              aria-current={isActive ? 'true' : undefined}
            >
              {index + 1}
              {isBookmarked && <Bookmark className="absolute -right-0.5 -top-0.5 size-3 fill-current" aria-hidden="true" />}
            </button>
          )
        })}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <Legend color="bg-[#006C35]" label="Sudah dijawab" />
        <Legend color="bg-[#D97706]" label="Ditandai ragu" />
        <Legend color="border border-slate-200 bg-white" label="Belum dilihat" />
      </div>
    </nav>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-sm ${color}`} />
      {label}
    </div>
  )
}
