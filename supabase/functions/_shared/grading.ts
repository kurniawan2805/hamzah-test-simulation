export type Skill = 'writing' | 'speaking'

export function gradingSchema(skill: Skill) {
  const fields = skill === 'writing'
    ? ['grammar_score', 'vocabulary_score', 'relevance_score']
    : ['language_score', 'coherence_score', 'relevance_score']
  const properties: Record<string, unknown> = Object.fromEntries(fields.map((key) => [key,
    { type: 'integer', minimum: 0, maximum: key === 'relevance_score' ? 30 : 35 },
  ]))
  Object.assign(properties, {
    feedback_id: { type: 'string' }, feedback_ar: { type: 'string' },
    corrections: { type: 'array', items: { type: 'object', properties: {
      original: { type: 'string' }, corrected: { type: 'string' },
      category: { type: 'string', enum: ['Grammar', 'Spelling', 'Vocabulary'] },
      explanation_id: { type: 'string' },
    }, required: ['original', 'corrected', 'category', 'explanation_id'], additionalProperties: false } },
  })
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}

export function normalizeGrade(raw: unknown, skill: Skill, submission: string): Record<string, unknown> & { total_score: number } {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid grading response')
  const row = raw as Record<string, unknown>
  const fields = skill === 'writing'
    ? ['grammar_score', 'vocabulary_score', 'relevance_score']
    : ['language_score', 'coherence_score', 'relevance_score']
  for (const key of fields) {
    const value = row[key]
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > (key === 'relevance_score' ? 30 : 35)) {
      throw new Error('Invalid rubric score')
    }
  }
  if (typeof row.feedback_id !== 'string' || typeof row.feedback_ar !== 'string' || !Array.isArray(row.corrections)) {
    throw new Error('Invalid grading feedback')
  }
  for (const correction of row.corrections) {
    if (!correction || typeof correction !== 'object' ||
      !['original', 'corrected', 'explanation_id'].every(key => typeof correction[key] === 'string') ||
      !['Grammar', 'Spelling', 'Vocabulary'].includes(correction.category)) throw new Error('Invalid correction')
    if (!submission.includes(correction.original)) throw new Error('Correction lacks submission evidence')
  }
  const total = fields.reduce((sum, key) => sum + (row[key] as number), 0)
  return {
    ...row, total_score: total, rubric_version: '2026-10-content-v2',
    ...(skill === 'speaking' ? {
      assessment_basis: 'transcript_only', transcript: submission,
      pronunciation_score: null, fluency_score: null,
    } : { word_count: submission.trim().split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word)).length }),
  }
}

export function responseText(raw: unknown): string {
  const data = raw as { status?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] }
  if (data.status !== 'completed') throw new Error('Grading response incomplete')
  const parts = (data.output ?? []).filter(item => item.type === 'message').flatMap(item => item.content ?? [])
  if (parts.some(part => part.type === 'refusal')) throw new Error('Grading refused')
  const text = parts.filter(part => part.type === 'output_text').map(part => part.text ?? '').join('')
  if (!text) throw new Error('Empty grading response')
  return text
}
