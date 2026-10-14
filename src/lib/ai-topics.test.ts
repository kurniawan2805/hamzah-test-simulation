import { describe, expect, it } from 'vitest'
import { aiTopicById, aiTopics, recommendTopics } from './ai-topics'
import { questionSchema } from './schema'

describe('AI topic catalog', () => {
  it('keeps a stable grammar and structures catalog', () => {
    expect(aiTopics.length).toBeGreaterThanOrEqual(5)
    expect(aiTopics.every((topic) => topic.section === 'grammar' || topic.section === 'structures')).toBe(true)
    expect(new Set(aiTopics.map((topic) => topic.id)).size).toBe(aiTopics.length)
  })

  it('resolves topics by id', () => {
    expect(aiTopicById('grammar_huruf_jar')?.title).toBe('Huruf Jar')
    expect(aiTopicById('tidak-ada')).toBeUndefined()
  })

  it('accepts an optional topic field on questions', () => {
    const base = {
      id: 'q1',
      section: 'grammar',
      question: 'أ',
      options: ['a', 'b', 'c', 'd'],
      correct_index: 0,
      explanation: 'penjelasan',
    }
    expect(questionSchema.safeParse(base).success).toBe(true)
    expect(questionSchema.safeParse({ ...base, topic: 'grammar_huruf_jar' }).success).toBe(true)
  })
})

describe('topic recommendation from section scores', () => {
  it('recommends a grammar topic when grammar is the weakest section', () => {
    const recommendations = recommendTopics({ listening: 80, reading: 75, grammar: 45, structures: 70 })
    expect(recommendations).toHaveLength(1)
    expect(recommendations[0]?.topicId).toBe('grammar_huruf_jar')
    expect(recommendations[0]?.section).toBe('grammar')
  })

  it('recommends a structures topic when structures is the weakest section', () => {
    const recommendations = recommendTopics({ listening: 80, reading: 75, grammar: 70, structures: 40 })
    expect(recommendations[0]?.topicId).toBe('structures_kaana')
    expect(recommendations[0]?.section).toBe('structures')
  })

  it('returns a generic suggestion for the weakest listening section', () => {
    const recommendations = recommendTopics({ listening: 35, reading: 80, grammar: 70, structures: 70 })
    expect(recommendations[0]?.topicId).toBeNull()
    expect(recommendations[0]?.section).toBe('listening')
  })

  it('returns nothing when no section score is available', () => {
    expect(recommendTopics({})).toEqual([])
  })

  it('keeps deterministic order when sections tie', () => {
    const recommendations = recommendTopics({ listening: 90, reading: 90, grammar: 40, structures: 40 })
    expect(recommendations.map((item) => item.section)).toEqual(['grammar', 'structures'])
  })
})
