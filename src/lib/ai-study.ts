import type { Section } from '../types'
import type { AiStudyQuota } from './ai-study-quota'

export type AiChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export type AiQuizQuestion = {
  index: number
  question: string
  options: [string, string, string, string]
  passage?: string
  questionId?: string
}

export type AiQuiz = {
  id: string
  topicId: string
  questions: AiQuizQuestion[]
  createdAt: number
}

export type AiQuizResultQuestion = AiQuizQuestion & {
  selectedIndex: number | null
  correctIndex: number
  explanation: string
  isCorrect: boolean
}

export type AiQuizResult = {
  score: number
  correctCount: number
  questions: AiQuizResultQuestion[]
}

export type AiTopicState = {
  lessonLoaded: boolean
  messages: AiChatMessage[]
  quiz: AiQuiz | null
  quizAnswers: (number | null)[]
  quizResult: AiQuizResult | null
}

export type AiStudyAdapter = {
  loadTopicState(topicId: string, section: Section): Promise<AiTopicState>
  loadLesson(topicId: string, section: Section): Promise<AiTopicState>
  generateQuiz(topicId: string, section: Section): Promise<AiTopicState>
  gradeQuiz(topicId: string, quizId: string, answers: readonly (number | null)[]): Promise<AiTopicState>
  saveQuizAnswers(topicId: string, quizId: string, answers: readonly (number | null)[]): Promise<void>
  sendChat(topicId: string, section: Section, message: string): Promise<AiTopicState>
  loadQuota(): Promise<AiStudyQuota>
}
