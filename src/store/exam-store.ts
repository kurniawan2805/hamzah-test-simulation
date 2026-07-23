import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { SessionResult } from '../types'

export interface CloudSessionBackup {
  currentIndex: number
  answers: Record<string, { selectedIndex?: number; bookmarked: boolean; audioPlayCount: number; answerText?: string; audioStoragePath?: string }>
  updatedAt: number
}

interface ExamState {
  activeExamId: string | null
  startedAt: number | null
  endsAt: number | null
  submittedAt: number | null
  currentIndex: number
  answers: Record<string, number>
  writingAnswers: Record<string, string>
  writingGrades: Record<string, { score: number; feedback: unknown }>
  speakingAnswers: Record<string, string>
  speakingGrades: Record<string, { score: number; feedback: unknown }>
  bookmarks: string[]
  viewedQuestionIds: string[]
  audioPlays: Record<string, number>
  history: SessionResult[]
  cloudBackups: Record<string, CloudSessionBackup>
  startExam: (examId: string, durationMinutes: number) => void
  setCurrentIndex: (index: number, questionId: string) => void
  answerQuestion: (questionId: string, answerIndex: number) => void
  setWritingAnswer: (questionId: string, text: string) => void
  setWritingGrades: (grades: Record<string, { score: number; feedback: unknown }>) => void
  setSpeakingAnswer: (questionId: string, pathOrBlob: string) => void
  setSpeakingGrades: (grades: Record<string, { score: number; feedback: unknown }>) => void
  toggleBookmark: (questionId: string) => void
  markAudioPlay: (questionId: string) => boolean
  completeExam: (result: SessionResult) => void
  resetActiveExam: () => void
  cacheCloudAnswer: (attemptId: string, questionId: string, answer: CloudSessionBackup['answers'][string]) => void
  setCloudCurrentIndex: (attemptId: string, currentIndex: number) => void
  clearCloudBackup: (attemptId: string) => void
}

const emptySession = {
  activeExamId: null,
  startedAt: null,
  endsAt: null,
  submittedAt: null,
  currentIndex: 0,
  answers: {},
  writingAnswers: {},
  writingGrades: {},
  speakingAnswers: {},
  speakingGrades: {},
  bookmarks: [],
  viewedQuestionIds: [],
  audioPlays: {},
}

export const useExamStore = create<ExamState>()(
  persist(
    (set, get) => ({
      ...emptySession,
      history: [],
      cloudBackups: {},
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
      setWritingAnswer: (questionId, text) =>
        set((state) => ({ writingAnswers: { ...state.writingAnswers, [questionId]: text } })),
      setWritingGrades: (writingGrades) =>
        set({ writingGrades }),
      setSpeakingAnswer: (questionId, pathOrBlob) =>
        set((state) => ({ speakingAnswers: { ...state.speakingAnswers, [questionId]: pathOrBlob } })),
      setSpeakingGrades: (speakingGrades) =>
        set({ speakingGrades }),
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
      cacheCloudAnswer: (attemptId, questionId, answer) =>
        set((state) => {
          const previous = state.cloudBackups[attemptId] ?? { currentIndex: 0, answers: {}, updatedAt: Date.now() }
          return {
            cloudBackups: {
              ...state.cloudBackups,
              [attemptId]: { ...previous, answers: { ...previous.answers, [questionId]: answer }, updatedAt: Date.now() },
            },
          }
        }),
      setCloudCurrentIndex: (attemptId, currentIndex) =>
        set((state) => {
          const previous = state.cloudBackups[attemptId] ?? { currentIndex: 0, answers: {}, updatedAt: Date.now() }
          return { cloudBackups: { ...state.cloudBackups, [attemptId]: { ...previous, currentIndex, updatedAt: Date.now() } } }
        }),
      clearCloudBackup: (attemptId) =>
        set((state) => {
          const remaining = Object.fromEntries(Object.entries(state.cloudBackups).filter(([id]) => id !== attemptId)) as Record<string, CloudSessionBackup>
          return { cloudBackups: remaining }
        }),
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
          writingAnswers: state.writingAnswers,
          writingGrades: state.writingGrades,
          speakingAnswers: state.speakingAnswers,
          speakingGrades: state.speakingGrades,
          bookmarks: state.bookmarks,
          viewedQuestionIds: state.viewedQuestionIds,
          audioPlays: state.audioPlays,
          history: state.history,
          cloudBackups: state.cloudBackups,
        }),
    },
  ),
)
