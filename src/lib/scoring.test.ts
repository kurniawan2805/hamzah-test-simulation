import { describe, expect, it } from 'vitest'
import { demoExam } from '../data/exam-data'
import { calculateRemainingSeconds, createSessionResult, getCefrLevel } from './scoring'

describe('exam scoring', () => {
  it('calculates total and competency scores from the answer key', () => {
    const answers = Object.fromEntries(demoExam.questions.map((question) => [question.id, question.correct_index]))
    const result = createSessionResult(demoExam, answers, 'manual', 1_000)

    expect(result.score).toBe(87)
    // 75 scored questions (65 MCQ + 5 Writing + 5 Speaking)
    expect(result.correctCount).toBe(65)
    expect(result.totalQuestions).toBe(75)
    expect(result.cefr).toBe('C1')
    expect(result.sectionScores).toEqual({ listening: 100, reading: 100, grammar: 100, structures: 100, writing: 0, speaking: 0 })
  })

  it('uses the expected CEFR boundaries', () => {
    expect(getCefrLevel(39)).toBe('A2')
    expect(getCefrLevel(40)).toBe('B1')
    expect(getCefrLevel(60)).toBe('B2')
    expect(getCefrLevel(80)).toBe('C1')
  })

  it('incorporates writing and speaking scores in final result', () => {
    const answers = Object.fromEntries(demoExam.questions.map((question) => [question.id, question.correct_index]))

    const writingGrades = {
      'hamza_q_066': { score: 80, feedback: {} },
      'hamza_q_067': { score: 80, feedback: {} },
      'hamza_q_068': { score: 80, feedback: {} },
      'hamza_q_069': { score: 80, feedback: {} },
      'hamza_q_070': { score: 80, feedback: {} },
    }

    const speakingGrades = {
      'hamza_q_071': { score: 90, feedback: {} },
      'hamza_q_072': { score: 90, feedback: {} },
      'hamza_q_073': { score: 90, feedback: {} },
      'hamza_q_074': { score: 90, feedback: {} },
      'hamza_q_075': { score: 90, feedback: {} },
    }

    const result = createSessionResult(demoExam, answers, 'manual', 1_000, {}, writingGrades, speakingGrades)
    
    // MCQ total = 65, Writing = 5 * 0.8 = 4, Speaking = 5 * 0.9 = 4.5
    // Total scored = 75
    // Total points = 65 + 4 + 4.5 = 73.5
    // Score = (73.5 / 75) * 100 = 98
    expect(result.score).toBe(98)
    expect(result.correctCount).toBe(74) // Math.round(73.5)
    expect(result.sectionScores.writing).toBe(80)
    expect(result.sectionScores.speaking).toBe(90)
  })

  it('derives remaining time from an end timestamp, including expired sessions', () => {
    expect(calculateRemainingSeconds(11_250, 10_000)).toBe(2)
    expect(calculateRemainingSeconds(10_000, 10_000)).toBe(0)
    expect(calculateRemainingSeconds(9_000, 10_000)).toBe(0)
  })
})
