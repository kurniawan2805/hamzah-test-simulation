import { Bookmark } from 'lucide-react'
import type { Question } from '../types'

interface QuestionGridProps {
  questions: Question[]
  activeIndex: number
  answers: Record<string, number>
  bookmarks: string[]
  viewedQuestionIds: string[]
  onSelect: (index: number) => void
}

export function QuestionGrid({ questions, activeIndex, answers, bookmarks, viewedQuestionIds, onSelect }: QuestionGridProps) {
  return (
    <aside className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">Navigasi soal</p>
          <p className="mt-0.5 text-xs text-slate-500">Pilih nomor untuk berpindah.</p>
        </div>
        <Bookmark size={18} className="text-[#D97706]" />
      </div>
      <div className="mt-4">
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-8 md:grid-cols-7 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-5">
        {questions.map((question, index) => {
          const isAnswered = question.id in answers
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

          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onSelect(index)}
              className={`relative grid aspect-square w-full place-items-center rounded-md text-[11px] font-bold transition-[transform,box-shadow,background-color] active:scale-[0.96] ${stateClass} ${isActive ? 'ring-2 ring-[#006C35] ring-offset-2' : ''}`}
              aria-label={`Soal ${index + 1}${isAnswered ? ', sudah dijawab' : ''}${isBookmarked ? ', ditandai ragu' : ''}`}
            >
              {index + 1}
              {isBookmarked && <Bookmark className="absolute -right-0.5 -top-0.5 size-3 fill-current" />}
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
    </aside>
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
