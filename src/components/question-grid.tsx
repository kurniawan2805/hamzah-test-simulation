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
    <aside className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-900">Navigasi soal</p>
          <p className="mt-1 text-xs text-slate-500">Pilih nomor untuk berpindah.</p>
        </div>
        <Bookmark size={18} className="text-[#D97706]" />
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2.5">
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
              className={`relative grid size-10 place-items-center rounded-lg text-sm font-bold transition-[transform,box-shadow,background-color] active:scale-[0.96] ${stateClass} ${isActive ? 'ring-2 ring-[#006C35] ring-offset-2' : ''}`}
              aria-label={`Soal ${index + 1}${isAnswered ? ', sudah dijawab' : ''}${isBookmarked ? ', ditandai ragu' : ''}`}
            >
              {index + 1}
              {isBookmarked && <Bookmark className="absolute -right-1 -top-1 size-3.5 fill-current" />}
            </button>
          )
        })}
      </div>
      <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <Legend color="bg-[#006C35]" label="Sudah dijawab" />
        <Legend color="bg-[#D97706]" label="Ditandai ragu" />
        <Legend color="border border-slate-200 bg-white" label="Belum dilihat" />
      </div>
    </aside>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-3 rounded-sm ${color}`} />
      {label}
    </div>
  )
}
