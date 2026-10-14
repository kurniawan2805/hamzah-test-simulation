import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SpeakingScoreBreakdown } from './speaking-score-breakdown'

afterEach(cleanup)
describe('speaking review rubric', () => {
  it('explains transcript-only grading and renders content components', () => {
    render(<SpeakingScoreBreakdown feedback={{ assessment_basis: 'transcript_only', language_score: 25, coherence_score: 20, relevance_score: 15, pronunciation_score: null, fluency_score: null }} />)
    expect(screen.getByText(/kelancaran lisan belum dinilai/)).toBeInTheDocument()
    expect(screen.getByText('Tata Bahasa & Kosakata')).toBeInTheDocument()
    expect(screen.getByText('Koherensi Isi')).toBeInTheDocument()
    expect(screen.getByText('25 / 35')).toBeInTheDocument()
    expect(screen.queryByText('Pelafalan (Makhraj)')).not.toBeInTheDocument()
  })
  it('preserves the labels of historical grades', () => {
    render(<SpeakingScoreBreakdown feedback={{ pronunciation_score: 30, fluency_score: 25, relevance_score: 20 }} />)
    expect(screen.getByText('Pelafalan (Makhraj)')).toBeInTheDocument()
    expect(screen.getByText('Kelancaran (Fluency)')).toBeInTheDocument()
    expect(screen.queryByText(/berdasarkan isi transkrip/)).not.toBeInTheDocument()
  })
  it('does not present missing components as zero', () => {
    render(<SpeakingScoreBreakdown feedback={{ assessment_basis: 'transcript_only' }} />)
    expect(screen.getAllByText('Belum dinilai')).toHaveLength(3)
  })
})
