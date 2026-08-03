import { describe, expect, it } from 'vitest'
import { canAccessPackage, FREE_ATTEMPT_LIMIT, freeAttemptsRemaining, tierLabels, tierRank } from './tiers'

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
    expect(canAccessPackage('free', 'vip_plus')).toBe(false)
    expect(canAccessPackage('vip', 'free')).toBe(true)
    expect(canAccessPackage('vip', 'vip')).toBe(true)
    expect(canAccessPackage('vip', 'vip_plus')).toBe(false)
    expect(canAccessPackage('vip_plus', 'free')).toBe(true)
    expect(canAccessPackage('vip_plus', 'vip')).toBe(true)
    expect(canAccessPackage('vip_plus', 'vip_plus')).toBe(true)
  })

  it('keeps explicit assignment and admin access unconditional', () => {
    expect(canAccessPackage('free', 'vip_plus', { assigned: true })).toBe(true)
    expect(canAccessPackage('free', 'vip_plus', { isAdmin: true })).toBe(true)
  })
})

describe('free attempt quota', () => {
  it('gives the free tier exactly FREE_ATTEMPT_LIMIT attempts', () => {
    expect(FREE_ATTEMPT_LIMIT).toBe(2)
    expect(freeAttemptsRemaining('free', 0)).toBe(2)
    expect(freeAttemptsRemaining('free', 1)).toBe(1)
    expect(freeAttemptsRemaining('free', 2)).toBe(0)
    expect(freeAttemptsRemaining('free', 5)).toBe(0)
  })

  it('keeps vip, vip_plus, and admin unlimited', () => {
    expect(freeAttemptsRemaining('vip', 10)).toBe(-1)
    expect(freeAttemptsRemaining('vip_plus', 10)).toBe(-1)
    expect(freeAttemptsRemaining('free', 10, true)).toBe(-1)
  })

  it('treats a missing tier as free', () => {
    expect(freeAttemptsRemaining(null, 2)).toBe(0)
  })
})
