import { beforeEach, describe, expect, it } from 'vitest'
import { useExamStore } from './exam-store'

describe('exam session storage', () => {
  beforeEach(() => {
    localStorage.clear()
    useExamStore.setState({
      activeExamId: null,
      startedAt: null,
      endsAt: null,
      submittedAt: null,
      currentIndex: 0,
      answers: {},
      bookmarks: [],
      viewedQuestionIds: [],
      audioPlays: {},
      history: [],
    })
  })

  it('starts a session using a durable end timestamp', () => {
    useExamStore.getState().startExam('simulasi-akbar-1', 10)
    const session = useExamStore.getState()

    expect(session.activeExamId).toBe('simulasi-akbar-1')
    expect(session.endsAt).toBe((session.startedAt ?? 0) + 600_000)
  })

  it('keeps an audio question limited to two play starts', () => {
    const { markAudioPlay } = useExamStore.getState()

    expect(markAudioPlay('hamza_q_001')).toBe(true)
    expect(markAudioPlay('hamza_q_001')).toBe(true)
    expect(markAudioPlay('hamza_q_001')).toBe(false)
    expect(useExamStore.getState().audioPlays.hamza_q_001).toBe(2)
  })

  it('preserves answers and bookmarks as user navigates', () => {
    const store = useExamStore.getState()
    store.answerQuestion('hamza_q_003', 1)
    store.toggleBookmark('hamza_q_003')
    store.setCurrentIndex(2, 'hamza_q_003')

    const session = useExamStore.getState()
    expect(session.answers.hamza_q_003).toBe(1)
    expect(session.bookmarks).toContain('hamza_q_003')
    expect(session.viewedQuestionIds).toContain('hamza_q_003')
  })
})
