import { describe, expect, it } from 'vitest'
import { ProviderError } from '../../supabase/functions/_shared/provider-error'

describe('safe provider diagnostics', () => {
  it('keeps status and code without retaining provider text or secrets', async () => {
    const error = await ProviderError.fromResponse(new Response(JSON.stringify({ error: { code: 'model_not_found', param: 'model', message: 'private student text and secret' } }), { status: 404 }), 'transcription')
    expect(error.status).toBe(404)
    expect(error.code).toBe('model_not_found')
    expect(error.parameter).toBe('model')
    expect(JSON.stringify(error)).not.toContain('private student')
    expect(error.message).not.toContain('secret')
  })
  it('handles non-JSON errors and rejects arbitrary diagnostic content', async () => {
    const html = await ProviderError.fromResponse(new Response('<html>gateway failure</html>', { status: 502 }), 'grading')
    expect(html.code).toBeNull()
    const unsafe = await ProviderError.fromResponse(new Response(JSON.stringify({ error: { code: 'private text with spaces', param: '<html>' } }), { status: 400 }), 'transcription')
    expect(unsafe.code).toBeNull()
    expect(unsafe.parameter).toBeNull()
  })
})
