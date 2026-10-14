import { describe, expect, it } from 'vitest'
import { AI_STUDY_DAILY_MESSAGES, AI_STUDY_DAILY_QUIZZES, dateKeyLocal, getAiStudyQuota } from './ai-study-quota'

describe('AI study daily quota', () => {
  it('starts fresh with full quota', () => {
    const quota = getAiStudyQuota(undefined, new Date('2026-08-03T10:00:00'))
    expect(quota.messagesRemaining).toBe(AI_STUDY_DAILY_MESSAGES)
    expect(quota.quizzesRemaining).toBe(AI_STUDY_DAILY_QUIZZES)
    expect(quota.messagesExhausted).toBe(false)
    expect(quota.quizzesExhausted).toBe(false)
  })

  it('resets when the usage row belongs to a previous day', () => {
    const quota = getAiStudyQuota({ date: '2026-08-02', messagesUsed: 30, quizzesUsed: 10 }, new Date('2026-08-03T08:00:00'))
    expect(quota.messagesRemaining).toBe(AI_STUDY_DAILY_MESSAGES)
    expect(quota.quizzesRemaining).toBe(AI_STUDY_DAILY_QUIZZES)
  })

  it('counts down remaining messages and quizzes for today', () => {
    const quota = getAiStudyQuota({ date: '2026-08-03', messagesUsed: 29, quizzesUsed: 9 }, new Date('2026-08-03T10:00:00'))
    expect(quota.messagesRemaining).toBe(1)
    expect(quota.quizzesRemaining).toBe(1)
  })

  it('marks the quota exhausted at the limit', () => {
    const quota = getAiStudyQuota({ date: '2026-08-03', messagesUsed: 30, quizzesUsed: 10 }, new Date('2026-08-03T10:00:00'))
    expect(quota.messagesExhausted).toBe(true)
    expect(quota.quizzesExhausted).toBe(true)
  })

  it('produces a stable local date key', () => {
    expect(dateKeyLocal(new Date(2026, 7, 3, 12, 0))).toBe('2026-08-03')
  })
})
