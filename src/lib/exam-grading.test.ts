import { describe, expect, it } from 'vitest'
import { gradingSchema, normalizeGrade, responseText } from '../../supabase/functions/_shared/grading'

const writing = { grammar_score: 30, vocabulary_score: 28, relevance_score: 25, feedback_id: 'Latih struktur kalimat.', feedback_ar: 'جيد', corrections: [] }
describe('server exam grading contract', () => {
  it('computes totals instead of trusting the model and counts actual words', () => {
    expect(normalizeGrade({ ...writing, total_score: 100 }, 'writing', 'أنا طالب .')).toMatchObject({ total_score: 83, word_count: 2 })
  })
  it.each([-1, 36, 3.5, NaN, '30'])('rejects invalid rubric scores %s', score => {
    expect(() => normalizeGrade({ ...writing, grammar_score: score }, 'writing', '')).toThrow('Invalid rubric score')
  })
  it('does not invent acoustic scores from text', () => {
    const feedback = normalizeGrade({ language_score: 25, coherence_score: 20, relevance_score: 15, feedback_id: 'Isi transkrip saja.', feedback_ar: 'جيد', corrections: [] }, 'speaking', 'أنا طالب')
    expect(feedback).toMatchObject({ total_score: 60, pronunciation_score: null, fluency_score: null, assessment_basis: 'transcript_only', transcript: 'أنا طالب' })
  })
  it('rejects corrections without evidence in the submission', () => {
    expect(() => normalizeGrade({ ...writing, corrections: [{ original: 'invented', corrected: 'x', category: 'Grammar', explanation_id: 'Koreksi' }] }, 'writing', 'أنا طالب')).toThrow('evidence')
  })
  it('reads raw REST output and rejects incomplete or refused responses', () => {
    expect(responseText({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] })).toBe('{}')
    expect(() => responseText({ status: 'incomplete' })).toThrow('incomplete')
    expect(() => responseText({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] })).toThrow('refused')
  })
  it('requires every rubric field in strict provider schema', () => {
    expect(gradingSchema('speaking').required).toContain('coherence_score')
    expect(gradingSchema('writing').additionalProperties).toBe(false)
  })
})
