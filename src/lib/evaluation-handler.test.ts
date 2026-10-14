// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { evaluationHandler } from '../../supabase/functions/_shared/evaluation-handler'
import type { Answer, EvaluationDependencies } from '../../supabase/functions/_shared/evaluation-handler'
import { transcriptionForm } from '../../supabase/functions/_shared/transcription'

const attemptId = '11111111-1111-4111-8111-111111111111'
const questionId = '22222222-2222-4222-8222-222222222222'
const grade = { language_score: 30, coherence_score: 25, relevance_score: 20, corrections: [], feedback_id: 'Isi jelas.', feedback_ar: 'جيد' }
const completion = (value: unknown = grade) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }))
const post = (body: unknown = { attempt_id: attemptId }, authenticated = true) => new Request('https://test/evaluate', { method: 'POST', headers: authenticated ? { Authorization: 'Bearer participant' } : {}, body: JSON.stringify(body) })
function fixture(answers: Answer[] = [{ questionId, question: 'عرف بنفسك', audioPath: `speaking/${attemptId}/${questionId}.mp4` }]) {
  const deps = {
    authorize: vi.fn(async () => true), answers: vi.fn(async () => answers),
    download: vi.fn(async () => new Blob(['audio'], { type: 'audio/mp4' })), save: vi.fn(async () => {}),
    env: (key: string) => key === 'OPENAI_API_KEY' ? 'test-key' : undefined,
    request: vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ text: 'أنا طالب' }))).mockResolvedValueOnce(completion()),
  } satisfies EvaluationDependencies
  return { deps, handle: evaluationHandler('speaking', 'Rubric', deps) }
}
describe('production evaluation handler', () => {
  it('transcribes Arabic with the new API contract and persists validated grades', async () => {
    const { deps, handle } = fixture()
    const response = await handle(post())
    expect(response.status).toBe(200)
    const form = deps.request.mock.calls[0][1]?.body as FormData
    expect(form.get('model')).toBe('gpt-transcribe')
    expect(form.getAll('languages[]')).toEqual(['ar'])
    expect(form.has('language')).toBe(false)
    expect((form.get('file') as File).name).toBe('recording.mp4')
    const request = JSON.parse(String(deps.request.mock.calls[1][1]?.body))
    expect(request.model).toBe('gpt-6-luna')
    expect(request.text.format.strict).toBe(true)
    expect(request.input[1].content).toContain('أنا طالب')
    expect(deps.save).toHaveBeenCalledWith(attemptId, [expect.objectContaining({ score: 75, feedback: expect.objectContaining({ pronunciation_score: null, transcription_model: 'gpt-transcribe' }) })])
  })
  it('rejects unauthenticated requests before database or paid calls', async () => {
    const { deps, handle } = fixture()
    expect((await handle(post(undefined, false))).status).toBe(401)
    expect(deps.authorize).not.toHaveBeenCalled()
    expect(deps.request).not.toHaveBeenCalled()
  })
  it('rejects non-owner or active attempts before loading answers', async () => {
    const { deps, handle } = fixture()
    deps.authorize.mockResolvedValue(false)
    expect((await handle(post())).status).toBe(403)
    expect(deps.answers).not.toHaveBeenCalled()
    expect(deps.request).not.toHaveBeenCalled()
  })
  it.each([null, [], {}, { attempt_id: '------------------------------------' }])('rejects malformed payload %j', async body => {
    const { deps, handle } = fixture()
    expect((await handle(post(body))).status).toBe(400)
    expect(deps.authorize).not.toHaveBeenCalled()
  })
  it('disables direct grading payloads', async () => {
    const { deps, handle } = fixture()
    expect((await handle(post({ answers: [] }))).status).toBe(403)
    expect(deps.request).not.toHaveBeenCalled()
  })
  it('handles preflight and rejects unsupported methods', async () => {
    const { deps, handle } = fixture()
    expect((await handle(new Request('https://test', { method: 'OPTIONS' }))).status).toBe(200)
    expect((await handle(new Request('https://test'))).status).toBe(405)
    expect(deps.authorize).not.toHaveBeenCalled()
  })
  it('does not grade or save when download fails', async () => {
    const { deps, handle } = fixture()
    deps.download.mockRejectedValue(new Error('storage down'))
    expect((await handle(post())).status).toBe(500)
    expect(deps.request).not.toHaveBeenCalled()
    expect(deps.save).not.toHaveBeenCalled()
  })
  it('rejects audio belonging to another attempt', async () => {
    const { deps, handle } = fixture([{ questionId, question: 'سؤال', audioPath: 'speaking/other/file.mp4' }])
    expect((await handle(post())).status).toBe(500)
    expect(deps.download).not.toHaveBeenCalled()
  })
  it.each([new Response('provider failed', { status: 503 }), new Response('{}'), new Response('{')])('never saves provider errors as zero', async response => {
    const { deps, handle } = fixture()
    deps.request.mockReset().mockResolvedValueOnce(response)
    expect((await handle(post())).status).toBe(500)
    expect(deps.save).not.toHaveBeenCalled()
  })
  it('does not save out-of-range model scores', async () => {
    const { deps, handle } = fixture()
    deps.request.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ text: 'أنا طالب' }))).mockResolvedValueOnce(completion({ ...grade, relevance_score: 31 }))
    expect((await handle(post())).status).toBe(500)
    expect(deps.save).not.toHaveBeenCalled()
  })
  it('returns failure when persistence fails', async () => {
    const { deps, handle } = fixture()
    deps.save.mockRejectedValue(new Error('database unavailable'))
    expect((await handle(post())).status).toBe(500)
  })
  it('assigns zero to genuinely missing recordings without a paid call', async () => {
    const { deps, handle } = fixture([{ questionId, question: 'سؤال' }])
    expect((await handle(post())).status).toBe(200)
    expect(deps.request).not.toHaveBeenCalled()
    expect(deps.save).toHaveBeenCalledWith(attemptId, [expect.objectContaining({ score: 0 })])
  })
  it('handles empty transcripts without sending them for grading', async () => {
    const { deps, handle } = fixture()
    deps.request.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ text: ' ' })))
    expect((await handle(post())).status).toBe(200)
    expect(deps.request).toHaveBeenCalledTimes(1)
  })
  it('uses the same validation and persistence for writing', async () => {
    const { deps } = fixture([{ questionId, question: 'اكتب عن نفسك', text: 'أنا طالب' }])
    deps.request.mockReset().mockResolvedValueOnce(completion({ grammar_score: 30, vocabulary_score: 30, relevance_score: 20, corrections: [], feedback_id: 'جيد', feedback_ar: 'جيد' }))
    expect((await evaluationHandler('writing', 'Rubric', deps)(post())).status).toBe(200)
    expect(deps.download).not.toHaveBeenCalled()
    expect(deps.save).toHaveBeenCalledWith(attemptId, [expect.objectContaining({ score: 80, feedback: expect.objectContaining({ word_count: 2 }) })])
  })
})
describe('transcription format compatibility', () => {
  it('keeps legacy model override compatible', () => {
    const form = transcriptionForm(new Blob(['x'], { type: 'audio/webm;codecs=opus' }), 'gpt-4o-transcribe')
    expect(form.get('language')).toBe('ar')
    expect(form.has('languages[]')).toBe(false)
  })
  it('uses storage extension when MIME metadata is generic', () => {
    const form = transcriptionForm(new Blob(['x'], { type: 'application/octet-stream' }), 'gpt-transcribe', 'recording.m4a')
    expect((form.get('file') as File).name).toBe('recording.m4a')
  })
  it('rejects empty and unknown formats', () => {
    expect(() => transcriptionForm(new Blob([]))).toThrow('size')
    expect(() => transcriptionForm(new Blob(['x'], { type: 'text/plain' }))).toThrow('format')
  })
})
