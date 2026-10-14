export class ProviderError extends Error {
  constructor(readonly stage: 'transcription' | 'grading', readonly status: number, readonly code: string | null, readonly parameter: string | null) {
    super(`${stage} provider failed`)
    this.name = 'ProviderError'
  }

  static async fromResponse(response: Response, stage: 'transcription' | 'grading') {
    let code: string | null
    let parameter: string | null
    try {
      const data = await response.json()
      const safeIdentifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_.[\]-]{1,80}$/.test(value) ? value : null
      code = safeIdentifier(data?.error?.code)
      parameter = safeIdentifier(data?.error?.param)
    } catch {
      code = null
      parameter = null
    }
    return new ProviderError(stage, response.status, code, parameter)
  }
}
