import { ProviderError } from './provider-error.ts'

export function transcriptionForm(audio: Blob, model = 'gpt-transcribe', path?: string) {
  if (audio.size === 0 || audio.size > 25 * 1024 * 1024) throw new Error('Invalid recording size')
  const mime = audio.type.split(';')[0].toLowerCase()
  const extensions: Record<string, string> = {
    'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mp4': 'mp4', 'video/mp4': 'mp4',
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
    'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-m4a': 'm4a',
  }
  const extension = extensions[mime] ?? path?.match(/\.(webm|mp4|mp3|wav|ogg|flac|m4a)$/i)?.[1].toLowerCase()
  if (!extension) throw new Error('Unsupported recording format')
  const form = new FormData()
  form.append('file', audio, `recording.${extension}`)
  form.append('model', model)
  form.append('response_format', 'json')
  if (model === 'gpt-transcribe') form.append('languages[]', 'ar')
  else form.append('language', 'ar')
  return form
}

export async function transcribe(audio: Blob, apiKey: string, model: string, request: typeof fetch, path?: string) {
  const response = await request('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` },
    body: transcriptionForm(audio, model, path), signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw await ProviderError.fromResponse(response, 'transcription')
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !('text' in data) || typeof data.text !== 'string') throw new Error('Invalid transcription response')
  return data.text.trim()
}
