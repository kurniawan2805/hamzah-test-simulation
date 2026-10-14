import type { Question, Section } from '../types'

const isStudySection = (section: Section): section is 'grammar' | 'structures' =>
  section === 'grammar' || section === 'structures'

export type BankQuestion = {
  id: string
  topic: string
  section: 'grammar' | 'structures'
  question: string
  options: [string, string, string, string]
  passage?: string
  correctIndex: number
  explanation: string
}

export type PublicBankQuestion = {
  id: string
  section: 'grammar' | 'structures'
  question: string
  options: [string, string, string, string]
  passage?: string
}

export function pickBankQuestions(
  questions: readonly Question[],
  topicId: string,
  limit = 5,
): BankQuestion[] {
  const cappedLimit = Math.max(1, Math.min(limit, 5))
  return questions
    .filter(
      (question): question is Question & { section: 'grammar' | 'structures'; topic: string } =>
        question.topic === topicId && isStudySection(question.section),
    )
    .slice(0, cappedLimit)
    .map((question) => ({
      id: question.id,
      topic: question.topic,
      section: question.section,
      question: question.question,
      options: question.options,
      passage: question.passage,
      correctIndex: question.correct_index,
      explanation: question.explanation,
    }))
}

export function toPublicBankQuestion(question: BankQuestion): PublicBankQuestion {
  return {
    id: question.id,
    section: question.section,
    question: question.question,
    options: question.options,
    passage: question.passage,
  }
}
