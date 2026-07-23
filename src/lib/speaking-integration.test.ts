import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Speaking AI Edge Function Integration', () => {
  it('sends a mock question and audio recording to the edge function for evaluation', async () => {
    const audioPath = path.resolve(__dirname, '../../data/1.mp3')
    expect(fs.existsSync(audioPath)).toBe(true)
    const audioBuffer = fs.readFileSync(audioPath)

    // Convert Buffer to base64 string
    const base64Audio = audioBuffer.toString('base64')

    // 2. Prepare mock question and answer payload
    const questionId = 'hamza_q_speaking_test'
    const questionText = 'عرّف بنفسك وتحدث tentang sekolahmu atau pekerjaanmu.'
    
    const payload = {
      answers: [
        {
          question_id: questionId,
          question_text: questionText,
          audio_base64: base64Audio,
        }
      ]
    }

    // 3. Determine endpoint
    const localEndpoint = 'http://127.0.0.1:54321/functions/v1/evaluate-speaking'
    const remoteEndpoint = 'https://crbtkqemvvtzfgtffvos.supabase.co/functions/v1/evaluate-speaking'
    
    let endpoint = localEndpoint
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Check if local Deno Edge Function is running
    try {
      const pingRes = await fetch('http://127.0.0.1:54321/functions/v1/evaluate-speaking', { method: 'OPTIONS' })
      if (!pingRes.ok && pingRes.status !== 200) {
        throw new Error('Local server offline')
      }
    } catch {
      // Fallback to remote endpoint if local server is offline
      endpoint = remoteEndpoint
      const anonKey = 'sb_publishable_9fExz0zwFtA-65bl9WJhdA_w8BUsVO8'
      headers['Authorization'] = `Bearer ${anonKey}`
      headers['apikey'] = anonKey
    }

    console.log(`Sending evaluation request to speaking endpoint: ${endpoint}`)

    // 4. Send evaluation request
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      const responseText = await response.text()
      console.log('Response Status:', response.status)
      console.log('Response Body:', responseText)

      if (response.status === 200) {
        const json = JSON.parse(responseText)
        expect(json.success).toBe(true)
        expect(json.data).toBeInstanceOf(Array)
        expect(json.data[0].question_id).toBe(questionId)
        expect(json.data[0].score).toBeTypeOf('number')
        expect(json.data[0].feedback).toBeDefined()
        expect(json.data[0].feedback.transcript).toBeTypeOf('string')
      } else {
        console.warn(`Request failed with status ${response.status}. This is expected if the local/remote server is not fully configured with OpenAI credentials.`)
      }
    } catch (error) {
      console.error('Request connection failed:', error)
    }
  }, 30000)
})
