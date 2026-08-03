import { describe, expect, it } from 'vitest'
import { canAccessPackage, tierLabels, tierRank } from './tiers'

describe('user tier access', () => {
  it('maps tiers to labels and ranks', () => {
    expect(tierLabels.free).toBe('Gratis')
    expect(tierLabels.vip).toBe('VIP')
    expect(tierLabels.vip_plus).toBe('VIP+')
    expect(tierRank('free')).toBe(0)
    expect(tierRank('vip')).toBe(1)
    expect(tierRank('vip_plus')).toBe(2)
    expect(tierRank(null)).toBe(0)
  })

  it('grants access at or above the package minimum tier', () => {
    expect(canAccessPackage('free', 'free')).toBe(true)
    expect(canAccessPackage('free', 'vip')).toBe(false)
    expect(canAccessPackage('vip', 'free')).toBe(true)
    expect(canAccessPackage('vip', 'vip')).toBe(true)
    expect(canAccessPackage('vip', 'vip_plus')).toBe(false)
    expect(canAccessPackage('vip_plus', 'vip_plus')).toBe(true)
  })

  it('keeps explicit assignment and admin access unconditional', () => {
    expect(canAccessPackage('free', 'vip_plus', { assigned: true })).toBe(true)
    expect(canAccessPackage('free', 'vip_plus', { isAdmin: true })).toBe(true)
  })
})
