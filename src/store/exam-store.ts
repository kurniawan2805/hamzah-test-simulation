import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { SessionResult } from '../types'

interface ExamState {
  activeExamId: string | null
  startedAt: number | null
  endsAt: number | null
  submittedAt: number | null
  currentIndex: number
  answers: Record<string, number>
  bookmarks: string[]
  viewedQuestionIds: string[]
  audioPlays: Record<string, number>
  history: SessionResult[]
  startExam: (examId: string, durationMinutes: number) => void
  setCurrentIndex: (index: number, questionId: string) => void
  answerQuestion: (questionId: string, answerIndex: number) => void
  toggleBookmark: (questionId: string) => void
  markAudioPlay: (questionId: string) => boolean
  completeExam: (result: SessionResult) => void
  resetActiveExam: () => void
}

const emptySession = {
  activeExamId: null,
  startedAt: null,
  endsAt: null,
  submittedAt: null,
  currentIndex: 0,
  answers: {},
  bookmarks: [],
  viewedQuestionIds: [],
  audioPlays: {},
}

export const useExamStore = create<ExamState>()(
  persist(
    (set, get) => ({
      ...emptySession,
      history: [],
      startExam: (examId, durationMinutes) => {
        const now = Date.now()
        set({
          ...emptySession,
          activeExamId: examId,
          startedAt: now,
          endsAt: now + durationMinutes * 60_000,
          viewedQuestionIds: ['hamza_q_001'],
        })
      },
      setCurrentIndex: (currentIndex, questionId) =>
        set((state) => ({
          currentIndex,
          viewedQuestionIds: state.viewedQuestionIds.includes(questionId)
            ? state.viewedQuestionIds
            : [...state.viewedQuestionIds, questionId],
        })),
      answerQuestion: (questionId, answerIndex) =>
        set((state) => ({ answers: { ...state.answers, [questionId]: answerIndex } })),
      toggleBookmark: (questionId) =>
        set((state) => ({
          bookmarks: state.bookmarks.includes(questionId)
            ? state.bookmarks.filter((id) => id !== questionId)
            : [...state.bookmarks, questionId],
        })),
      markAudioPlay: (questionId) => {
        const plays = get().audioPlays[questionId] ?? 0
        if (plays >= 2) return false
        set((state) => ({ audioPlays: { ...state.audioPlays, [questionId]: plays + 1 } }))
        return true
      },
      completeExam: (result) =>
        set((state) => ({
          submittedAt: result.completedAt,
          history: [result, ...state.history.filter((entry) => entry.id !== result.id)].slice(0, 8),
        })),
      resetActiveExam: () => set(emptySession),
    }),
    {
      name: 'hamza-test-simulation',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeExamId: state.activeExamId,
        startedAt: state.startedAt,
        endsAt: state.endsAt,
        submittedAt: state.submittedAt,
        currentIndex: state.currentIndex,
        answers: state.answers,
        bookmarks: state.bookmarks,
        viewedQuestionIds: state.viewedQuestionIds,
        audioPlays: state.audioPlays,
        history: state.history,
      }),
    },
  ),
)
