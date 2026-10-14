import { gradingSchema, normalizeGrade, responseText } from './grading.ts'
import type { Skill } from './grading.ts'
import { transcribe } from './transcription.ts'
import { ProviderError } from './provider-error.ts'

export type Answer = { questionId: string; question: string; text?: string | null; audioPath?: string | null }
export type Evaluation = { question_id: string; score: number; feedback: Record<string, unknown> }
export type EvaluationDependencies = {
  authorize: (authorization: string, attemptId: string) => Promise<boolean>
  answers: (attemptId: string) => Promise<Answer[]>
  download: (path: string) => Promise<Blob>
  save: (attemptId: string, grades: Evaluation[]) => Promise<void>
  env: (name: string) => string | undefined
  request: typeof fetch
}

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })

export function evaluationHandler(skill: Skill, prompt: string, deps: EvaluationDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    let body: unknown
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request' }, 400)
    if ('answers' in body) return json({ error: 'Direct grading is disabled' }, 403)
    const attemptId = 'attempt_id' in body ? body.attempt_id : undefined
    if (typeof attemptId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId)) return json({ error: 'Invalid attempt_id' }, 400)
    const authorization = req.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)
    try {
      if (!await deps.authorize(authorization, attemptId)) return json({ error: 'Completed attempt not found' }, 403)
      const apiKey = deps.env('OPENAI_API_KEY')
      if (!apiKey) throw new Error('Missing provider configuration')
      const model = deps.env('EXAM_GRADING_MODEL') ?? 'gpt-6-luna'
      const transcriptionModel = deps.env('EXAM_TRANSCRIPTION_MODEL') ?? 'gpt-transcribe'
      const answers = await deps.answers(attemptId)
      const grades: Evaluation[] = []
      for (const answer of answers) {
        let submission = answer.text?.trim() ?? ''
        if (skill === 'speaking') {
          submission = ''
          if (answer.audioPath) {
            if (!answer.audioPath.startsWith(`speaking/${attemptId}/${answer.questionId}.`) || answer.audioPath.includes('..')) throw new Error('Invalid recording path')
            const audio = await deps.download(answer.audioPath)
            submission = await transcribe(audio, apiKey, transcriptionModel, deps.request, answer.audioPath)
          }
        }
        let raw: unknown
        if (!submission) {
          raw = {
            ...(skill === 'writing' ? { grammar_score: 0, vocabulary_score: 0 } : { language_score: 0, coherence_score: 0 }),
            relevance_score: 0, corrections: [], feedback_id: skill === 'writing' ? 'Tidak ada jawaban yang dikirimkan.' : 'Tidak ada ucapan yang dapat dinilai. Pelafalan dan kelancaran lisan belum dinilai.',
            feedback_ar: 'لا توجد إجابة قابلة للتقييم.',
          }
        } else {
          const response = await deps.request('https://api.openai.com/v1/responses', {
            method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(90_000),
            body: JSON.stringify({ model, store: false, reasoning: { effort: 'low' }, max_output_tokens: 4096,
              text: { format: { type: 'json_schema', name: `${skill}_grade`, strict: true, schema: gradingSchema(skill) } },
              input: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify({ prompt_question: answer.question, student_submission: submission }) }],
            }),
          })
          if (!response.ok) throw await ProviderError.fromResponse(response, 'grading')
          raw = JSON.parse(responseText(await response.json()))
        }
        const feedback = { ...normalizeGrade(raw, skill, submission), grading_model: model, ...(skill === 'speaking' ? { transcription_model: transcriptionModel } : {}) }
        grades.push({ question_id: answer.questionId, score: feedback.total_score, feedback })
      }
      if (grades.length) await deps.save(attemptId, grades)
      return json({ success: true, data: grades })
    } catch (error) {
      const diagnostic = error instanceof ProviderError ? { stage: error.stage, status: error.status, code: error.code, parameter: error.parameter } : undefined
      if (diagnostic) console.error('exam_provider_failure', diagnostic)
      return json({ error: 'Penilaian belum berhasil. Silakan coba lagi.', ...(diagnostic ? { diagnostic } : {}) }, 500)
    }
  }
}
