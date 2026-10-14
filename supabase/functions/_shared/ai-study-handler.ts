import { responseText } from './grading.ts'
import { ProviderError } from './provider-error.ts'

export type StudyMessage = { role: 'user' | 'assistant' | 'system'; content: string }
export type StudyDependencies = {
  allowed: (auth: string) => Promise<boolean>
  userRpc: (auth: string, name: string, args: Record<string, unknown>) => Promise<unknown>
  adminRpc: (name: string, args: Record<string, unknown>) => Promise<unknown>
  history: (auth: string, sessionId: string) => Promise<StudyMessage[]>
  env: (key: string) => string | undefined
  request: typeof fetch
}

export const studyTopics: Record<string, string> = {
  grammar_huruf_jar: 'grammar', grammar_fiil_madhi_mudhari: 'grammar', grammar_mubtada_khabar: 'grammar',
  structures_kaana: 'structures', structures_isim_majrur: 'structures',
}
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
const object = (value: unknown): Record<string, unknown> => {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object') throw new Error('Invalid server data')
  return row as Record<string, unknown>
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const options = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(item => typeof item === 'string' && item.trim().length > 0)) throw new Error('Invalid quiz options')
  return value
}

export function studyHandler(deps: StudyDependencies, systemPrompt: string, quizPrompt: string) {
  async function generate(input: StudyMessage[], schema?: Record<string, unknown>) {
    const apiKey = deps.env('OPENAI_API_KEY')
    if (!apiKey) throw new Error('Missing provider configuration')
    const response = await deps.request('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ model: deps.env('AI_STUDY_MODEL') ?? 'gpt-6-luna', store: false, reasoning: { effort: 'low' },
        instructions: systemPrompt, input, max_output_tokens: 3000,
        ...(schema ? { text: { format: { type: 'json_schema', name: 'study_quiz', strict: true, schema } } } : {}),
      }),
    })
    if (!response.ok) throw await ProviderError.fromResponse(response, 'grading')
    return responseText(await response.json())
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return json({ error: 'Login diperlukan.' }, 401)
    let body: Record<string, unknown>
    try {
      const raw: unknown = await req.json()
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return json({ error: 'Request tidak valid.' }, 400)
      body = raw as Record<string, unknown>
    } catch { return json({ error: 'Request tidak valid.' }, 400) }
    try {
      if (!await deps.allowed(auth)) return json({ error: 'Akses ditolak: fitur khusus VIP+' }, 403)
      const action = body.action
      if (action === 'grade') {
        if (!uuid(body.quiz_id) || !Array.isArray(body.answers) || body.answers.length > 5 || !body.answers.every(a => a === null || (Number.isInteger(a) && Number(a) >= 0 && Number(a) <= 3))) return json({ error: 'Jawaban tidak valid.' }, 400)
        return json(object(await deps.userRpc(auth, 'ai_study_submit_quiz', { p_quiz_id: body.quiz_id, p_answers: body.answers })))
      }
      if (action === 'recommend') {
        const scores = object(body.section_scores ?? {})
        const ranked = ['listening', 'reading', 'grammar', 'structures'].filter(key => typeof scores[key] === 'number' && Number.isFinite(scores[key])).sort((a, b) => Number(scores[a]) - Number(scores[b]))
        return json({ recommendations: ranked.filter(key => scores[key] === scores[ranked[0]]).slice(0, 2).map(section => ({ section, topicId: section === 'grammar' ? 'grammar_huruf_jar' : section === 'structures' ? 'structures_kaana' : null, label: section, reason: `Skor ${section} adalah yang terendah.` })) })
      }
      if (!['lesson', 'chat', 'quiz_generate'].includes(String(action))) return json({ error: 'Action tidak dikenal.' }, 400)
      if (!uuid(body.session_id)) return json({ error: 'Sesi tidak valid.' }, 400)
      const sessionId = body.session_id
      const message = typeof body.message === 'string' ? body.message.trim() : ''
      if (action === 'chat' && (!message || message.length > 4000)) return json({ error: 'Isi pesan harus 1–4000 karakter.' }, 400)
      const context = object(await deps.userRpc(auth, 'ai_study_session_context', { p_session_id: sessionId }))
      if (typeof context.topic !== 'string' || studyTopics[context.topic] !== context.section) return json({ error: 'Topik sesi tidak valid.' }, 400)
      const topic = context.topic
      if (action === 'lesson' || action === 'chat') {
        const reservation = object(await deps.userRpc(auth, 'ai_study_reserve_message', { p_session_id: sessionId }))
        if (!uuid(reservation.request_id)) throw new Error('Invalid reservation')
        const history = action === 'chat' ? await deps.history(auth, sessionId) : []
        const content = await generate([
          ...history,
          { role: 'user', content: JSON.stringify({ topic, section: context.section, request: action, ...(action === 'chat' ? { message } : {}), max_characters: 5500 }) },
        ])
        if (!content.trim() || content.length > 6000) throw new Error('Invalid message length')
        await deps.adminRpc('ai_study_complete_message', { p_request_id: reservation.request_id, p_content: content, p_user_message: action === 'chat' ? message : null })
        return json(action === 'lesson' ? { content } : { reply: content })
      }

      const quizId = await deps.userRpc(auth, 'ai_study_begin_quiz', { p_session_id: sessionId })
      if (!uuid(quizId)) throw new Error('Invalid quiz reservation')
      const bank = await deps.userRpc(auth, 'ai_study_pick_questions', { p_topic: topic, p_limit: 5 })
      if (!Array.isArray(bank)) throw new Error('Invalid question bank')
      const questions: Record<string, unknown>[] = []
      const keys: Record<string, unknown>[] = []
      for (const value of bank.slice(0, 5)) {
        const row = object(value)
        if (!uuid(row.question_id) || typeof row.question !== 'string' || !row.question.trim()) throw new Error('Invalid bank question')
        questions.push({ question_id: row.question_id, question: row.question, options: options(row.options), passage: typeof row.passage === 'string' ? row.passage : null })
        keys.push({ question_id: row.question_id })
      }
      const missing = 5 - questions.length
      if (missing > 0) {
        const schema = { type: 'object', properties: { questions: { type: 'array', minItems: missing, maxItems: missing, items: { type: 'object', properties: {
          question: { type: 'string' }, options: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } }, correct_index: { type: 'integer', minimum: 0, maximum: 3 }, explanation: { type: 'string' },
        }, required: ['question', 'options', 'correct_index', 'explanation'], additionalProperties: false } } }, required: ['questions'], additionalProperties: false }
        const generated = object(JSON.parse(await generate([{ role: 'system', content: quizPrompt }, { role: 'user', content: JSON.stringify({ topic, section: context.section, count: missing }) }], schema))).questions
        if (!Array.isArray(generated) || generated.length !== missing) throw new Error('Incomplete generated quiz')
        for (const value of generated) {
          const row = object(value)
          if (typeof row.question !== 'string' || !row.question.trim() || !Number.isInteger(row.correct_index) || Number(row.correct_index) < 0 || Number(row.correct_index) > 3 || typeof row.explanation !== 'string' || !row.explanation.trim()) throw new Error('Invalid generated question')
          questions.push({ question: row.question, options: options(row.options), passage: null })
          keys.push({ correct_index: row.correct_index, explanation: row.explanation })
        }
      }
      await deps.adminRpc('ai_study_publish_quiz', { p_quiz_id: quizId, p_questions: questions, p_keys: keys })
      return json({ quiz_id: quizId, questions })
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Kuota ')) return json({ error: error.message }, 429)
      if (error instanceof Error && /^(Akses ditolak|Sesi belajar tidak ditemukan|Kuis tidak ditemukan)/.test(error.message)) return json({ error: 'Sesi atau kuis tidak dapat diakses.' }, 403)
      return json({ error: 'Layanan belajar AI belum berhasil. Silakan coba lagi.' }, 500)
    }
  }
}
