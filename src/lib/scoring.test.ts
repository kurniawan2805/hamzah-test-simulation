import { describe, expect, it } from 'vitest'
import { demoExam } from '../data/exam-data'
import { calculateRemainingSeconds, createSessionResult, getCefrLevel } from './scoring'

describe('exam scoring', () => {
  it('calculates total and competency scores from the answer key', () => {
    const answers = Object.fromEntries(demoExam.questions.map((question) => [question.id, question.correct_index]))
    const result = createSessionResult(demoExam, answers, 'manual', 1_000)

    expect(result.score).toBe(100)
    expect(result.correctCount).toBe(demoExam.questions.length)
    expect(result.cefr).toBe('C1')
    expect(result.sectionScores).toEqual({ listening: 100, reading: 100, grammar: 100, dictation: 100 })
  })

  it('uses the expected CEFR boundaries', () => {
    expect(getCefrLevel(39)).toBe('A2')
    expect(getCefrLevel(40)).toBe('B1')
    expect(getCefrLevel(60)).toBe('B2')
    expect(getCefrLevel(80)).toBe('C1')
  })

  it('derives remaining time from an end timestamp, including expired sessions', () => {
    expect(calculateRemainingSeconds(11_250, 10_000)).toBe(2)
    expect(calculateRemainingSeconds(10_000, 10_000)).toBe(0)
    expect(calculateRemainingSeconds(9_000, 10_000)).toBe(0)
  })
})
