import { describe, expect, it } from 'vitest'
import type { Question } from '../types'
import { pickBankQuestions, toPublicBankQuestion } from './ai-study-bank'

const grammarQuestion = (id: string, topic: string): Question => ({
  id,
  section: 'grammar',
  topic,
  question: `Soal ${id}`,
  options: ['a', 'b', 'c', 'd'],
  correct_index: 0,
  explanation: 'penjelasan',
})

describe('bank question picker', () => {
  it('returns tagged questions for the requested topic and caps the count', () => {
    const questions = [
      grammarQuestion('g1', 'grammar_huruf_jar'),
      grammarQuestion('g2', 'grammar_huruf_jar'),
      grammarQuestion('g3', 'grammar_huruf_jar'),
      grammarQuestion('g4', 'grammar_huruf_jar'),
      grammarQuestion('g5', 'grammar_huruf_jar'),
      grammarQuestion('g6', 'grammar_huruf_jar'),
    ]
    expect(pickBankQuestions(questions, 'grammar_huruf_jar').map((item) => item.id)).toEqual(['g1', 'g2', 'g3', 'g4', 'g5'])
  })

  it('exposes questions without the answer key', () => {
    const picked = pickBankQuestions([grammarQuestion('g1', 'grammar_huruf_jar')], 'grammar_huruf_jar')[0]
    const publicQuestion = toPublicBankQuestion(picked)
    expect('correctIndex' in publicQuestion).toBe(false)
    expect('explanation' in publicQuestion).toBe(false)
    expect(publicQuestion.question).toBe('Soal g1')
  })

  it('skips untagged questions and questions from other sections', () => {
    const questions: Question[] = [
      grammarQuestion('g1', 'grammar_huruf_jar'),
      grammarQuestion('g2', 'grammar_other'),
      { ...grammarQuestion('g3', 'grammar_huruf_jar'), section: 'reading' },
    ]
    expect(pickBankQuestions(questions, 'grammar_huruf_jar').map((item) => item.id)).toEqual(['g1'])
  })
})
