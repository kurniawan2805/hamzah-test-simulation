export type SpeakingRubricFeedback = {
  assessment_basis?: string
  pronunciation_score?: number | null
  fluency_score?: number | null
  language_score?: number
  coherence_score?: number
  relevance_score?: number
}

export function SpeakingScoreBreakdown({ feedback }: { feedback: SpeakingRubricFeedback }) {
  const contentOnly = feedback.assessment_basis === 'transcript_only'
  const parts = [
    { label: contentOnly ? 'Tata Bahasa & Kosakata' : 'Pelafalan (Makhraj)', score: contentOnly ? feedback.language_score : feedback.pronunciation_score, max: 35 },
    { label: contentOnly ? 'Koherensi Isi' : 'Kelancaran (Fluency)', score: contentOnly ? feedback.coherence_score : feedback.fluency_score, max: 35 },
    { label: 'Kesesuaian Tema', score: feedback.relevance_score, max: 30 },
  ]
  return <>
    {contentOnly && <p className="mb-3 text-slate-600">Nilai berdasarkan isi transkrip. Pelafalan, makhraj, dan kelancaran lisan belum dinilai.</p>}
    <div className="grid gap-3 sm:grid-cols-3 mb-4">
      {parts.map(part => <div key={part.label} className="rounded-xl bg-slate-50 p-3">
        <p className="text-xs text-slate-500">{part.label}</p>
        <p className="text-lg font-bold text-slate-900">{part.score == null ? 'Belum dinilai' : `${part.score} / ${part.max}`}</p>
      </div>)}
    </div>
  </>
}
