import { describe, expect, it, vi } from 'vitest'
import { studyHandler, studyTopics } from '../../supabase/functions/_shared/ai-study-handler'
import type { StudyDependencies } from '../../supabase/functions/_shared/ai-study-handler'
import { aiTopics } from './ai-topics'

const sessionId = '11111111-1111-4111-8111-111111111111'
const requestId = '22222222-2222-4222-8222-222222222222'
const quizId = '33333333-3333-4333-8333-333333333333'
const post = (body: unknown) => new Request('https://test', { method: 'POST', headers: { Authorization: 'Bearer qa' }, body: JSON.stringify({ session_id: sessionId, ...body as object }) })
const response = (text: string) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }))
const question = { question: 'سؤال', options: ['أ', 'ب', 'ج', 'د'], correct_index: 1, explanation: 'شرح' }
function fixture() {
  const deps = {
    allowed: vi.fn(async () => true),
    userRpc: vi.fn(async (_auth: string, name: string): Promise<unknown> => {
      if (name === 'ai_study_session_context') return { topic: 'grammar_huruf_jar', section: 'grammar' }
      if (name === 'ai_study_reserve_message') return { request_id: requestId }
      if (name === 'ai_study_begin_quiz') return quizId
      if (name === 'ai_study_pick_questions') return []
      return { score: 80, correct_count: 4, questions: [] }
    }),
    adminRpc: vi.fn(async () => null), history: vi.fn(async () => []),
    env: (key: string) => key === 'OPENAI_API_KEY' ? 'test-key' : undefined,
    request: vi.fn<typeof fetch>().mockResolvedValue(response('Materi singkat.')),
  } satisfies StudyDependencies
  return { deps, handle: studyHandler(deps, 'system', 'quiz') }
}
describe('AI study production handler', () => {
  it('rejects requests without a Bearer token before any database or provider access', async () => {
    const { deps, handle } = fixture()
    const request = new Request('https://test', { method: 'POST', body: JSON.stringify({ action: 'lesson', session_id: sessionId }) })
    expect((await handle(request)).status).toBe(401)
    expect(deps.allowed).not.toHaveBeenCalled()
    expect(deps.userRpc).not.toHaveBeenCalled()
    expect(deps.adminRpc).not.toHaveBeenCalled()
    expect(deps.request).not.toHaveBeenCalled()
  })
  it.each(['lesson', 'chat', 'quiz_generate', 'grade', 'recommend'])('requires database-verified access for %s', async action => {
    const { deps, handle } = fixture()
    deps.allowed.mockResolvedValue(false)
    expect((await handle(post({ action }))).status).toBe(403)
    expect(deps.allowed).toHaveBeenCalledWith('Bearer qa')
    expect(deps.userRpc).not.toHaveBeenCalled()
    expect(deps.adminRpc).not.toHaveBeenCalled()
    expect(deps.request).not.toHaveBeenCalled()
  })
  it('keeps the server topic catalog consistent with the UI', () => {
    expect(studyTopics).toEqual(Object.fromEntries(aiTopics.map(topic => [topic.id, topic.section])))
  })
  it('parses standard REST output and persists after a quota reservation', async () => {
    const { deps, handle } = fixture()
    expect((await handle(post({ action: 'lesson', topic: 'attacker-topic' }))).status).toBe(200)
    expect(deps.userRpc).toHaveBeenCalledWith('Bearer qa', 'ai_study_reserve_message', { p_session_id: sessionId })
    expect(deps.userRpc.mock.invocationCallOrder[1]).toBeLessThan(deps.request.mock.invocationCallOrder[0])
    const payload = JSON.parse(String(deps.request.mock.calls[0][1]?.body))
    expect(payload.model).toBe('gpt-6-luna')
    expect(payload.input[0].content).not.toContain('attacker-topic')
    expect(deps.adminRpc).toHaveBeenCalledWith('ai_study_complete_message', expect.objectContaining({ p_request_id: requestId, p_content: 'Materi singkat.' }))
  })
  it.each(['lesson', 'chat'])('does not call the provider for exhausted %s quota', async action => {
    const { deps, handle } = fixture()
    deps.userRpc.mockImplementation(async (_auth, name) => {
      if (name === 'ai_study_session_context') return { topic: 'grammar_huruf_jar', section: 'grammar' }
      throw new Error('Kuota pesan harian habis (30 pesan/hari)')
    })
    expect((await handle(post({ action, message: 'Jelaskan lagi' }))).status).toBe(429)
    expect(deps.request).not.toHaveBeenCalled()
  })
  it('propagates persistence failure instead of returning success', async () => {
    const { deps, handle } = fixture()
    deps.adminRpc.mockRejectedValue(new Error('database failure'))
    expect((await handle(post({ action: 'lesson' }))).status).toBe(500)
  })
  it('rejects a foreign session before reservation or provider use', async () => {
    const { deps, handle } = fixture()
    deps.userRpc.mockRejectedValue(new Error('Sesi belajar tidak ditemukan'))
    expect((await handle(post({ action: 'lesson' }))).status).toBe(403)
    expect(deps.request).not.toHaveBeenCalled()
  })
  it('blocks non-VIP callers', async () => {
    const { deps, handle } = fixture()
    deps.allowed.mockResolvedValue(false)
    expect((await handle(post({ action: 'lesson' }))).status).toBe(403)
    expect(deps.userRpc).not.toHaveBeenCalled()
  })
  it('publishes exactly five generated questions through one server RPC without leaking keys', async () => {
    const { deps, handle } = fixture()
    deps.request.mockResolvedValue(response(JSON.stringify({ questions: Array(5).fill(question) })))
    const res = await handle(post({ action: 'quiz_generate' }))
    expect(res.status).toBe(200)
    expect(deps.adminRpc).toHaveBeenCalledWith('ai_study_publish_quiz', expect.objectContaining({ p_quiz_id: quizId, p_keys: Array(5).fill({ correct_index: 1, explanation: 'شرح' }) }))
    const output = await res.json()
    expect(output.questions).toHaveLength(5)
    expect(JSON.stringify(output)).not.toMatch(/correct_index|explanation/)
  })
  it('rejects incomplete generated quizzes without publishing partial data', async () => {
    const { deps, handle } = fixture()
    deps.request.mockResolvedValue(response(JSON.stringify({ questions: [question] })))
    expect((await handle(post({ action: 'quiz_generate' }))).status).toBe(500)
    expect(deps.adminRpc).not.toHaveBeenCalled()
  })
  it('publishes a full bank quiz without calling the model', async () => {
    const { deps, handle } = fixture()
    const original = deps.userRpc.getMockImplementation()!
    deps.userRpc.mockImplementation(async (auth, name) => name === 'ai_study_pick_questions'
      ? Array.from({ length: 5 }, (_, i) => ({ question_id: `44444444-4444-4444-8444-44444444444${i}`, ...question }))
      : original(auth, name))
    expect((await handle(post({ action: 'quiz_generate' }))).status).toBe(200)
    expect(deps.request).not.toHaveBeenCalled()
    expect(deps.adminRpc).toHaveBeenCalledWith('ai_study_publish_quiz', expect.objectContaining({ p_keys: expect.arrayContaining([expect.objectContaining({ question_id: expect.any(String) })]) }))
  })
  it('does not generate questions when quiz quota is exhausted', async () => {
    const { deps, handle } = fixture()
    const original = deps.userRpc.getMockImplementation()!
    deps.userRpc.mockImplementation(async (auth, name) => {
      if (name === 'ai_study_begin_quiz') throw new Error('Kuota kuis harian habis (10 kuis/hari)')
      return original(auth, name)
    })
    expect((await handle(post({ action: 'quiz_generate' }))).status).toBe(429)
    expect(deps.request).not.toHaveBeenCalled()
    expect(deps.adminRpc).not.toHaveBeenCalled()
  })
  it('rejects refusals and incomplete provider output', async () => {
    const { deps, handle } = fixture()
    deps.request.mockResolvedValue(new Response(JSON.stringify({ status: 'incomplete' })))
    expect((await handle(post({ action: 'lesson' }))).status).toBe(500)
    expect(deps.adminRpc).not.toHaveBeenCalled()
  })
  it('routes grading through the immutable submit RPC', async () => {
    const { deps, handle } = fixture()
    expect((await handle(post({ action: 'grade', quiz_id: quizId, answers: [1, null] }))).status).toBe(200)
    expect(deps.userRpc).toHaveBeenCalledWith('Bearer qa', 'ai_study_submit_quiz', { p_quiz_id: quizId, p_answers: [1, null] })
    expect(deps.request).not.toHaveBeenCalled()
  })
})
