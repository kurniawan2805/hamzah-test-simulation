import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getFreeAttemptsRemaining, getPublishedExams } from './exam-api'

function mockClient(rows: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe('getPublishedExams', () => {
  it('skips published versions whose package is hidden by RLS (null join)', async () => {
    const client = mockClient([
      { id: 'vip-version', duration_minutes: 75, package: null },
      {
        id: 'free-version',
        duration_minutes: 75,
        package: { id: 'free-pkg', title: 'Paket Gratis', subtitle: 'Latihan', is_public: true, min_tier: 'free' },
      },
    ])

    const exams = await getPublishedExams(client)

    expect(exams).toHaveLength(1)
    expect(exams[0]).toMatchObject({ id: 'free-version', packageId: 'free-pkg', minTier: 'free' })
  })

  it('maps package min_tier to the published exam', async () => {
    const client = mockClient([
      {
        id: 'vip-version',
        duration_minutes: 75,
        package: { id: 'vip-pkg', title: 'Paket VIP', subtitle: 'Latihan', is_public: false, min_tier: 'vip' },
      },
    ])

    const exams = await getPublishedExams(client)

    expect(exams).toHaveLength(1)
    expect(exams[0].minTier).toBe('vip')
  })
})

function mockRpcClient(result: unknown, error: unknown = null) {
  return {
    rpc: async () => ({ data: result, error }),
  } as unknown as SupabaseClient
}

describe('getFreeAttemptsRemaining', () => {
  it.each([-1, 2, 1, 0])('maps RPC result %s to the same number', async (value) => {
    const client = mockRpcClient(value)
    await expect(getFreeAttemptsRemaining(client, 'version-1')).resolves.toBe(value)
  })

  it('treats a null result as unlimited fallback', async () => {
    const client = mockRpcClient(null)
    await expect(getFreeAttemptsRemaining(client, 'version-1')).resolves.toBe(-1)
  })

  it('forwards RPC errors', async () => {
    const client = mockRpcClient(null, new Error('rpc failed'))
    await expect(getFreeAttemptsRemaining(client, 'version-1')).rejects.toThrow('rpc failed')
  })
})
