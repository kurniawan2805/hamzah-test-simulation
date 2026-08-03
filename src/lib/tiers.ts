import type { UserTier } from '../types'

export const tierOrder: Record<UserTier, number> = {
  free: 0,
  vip: 1,
  vip_plus: 2,
}

export const tierLabels: Record<UserTier, string> = {
  free: 'Gratis',
  vip: 'VIP',
  vip_plus: 'VIP+',
}

export const tierOptions = Object.keys(tierOrder) as UserTier[]

export const FREE_ATTEMPT_LIMIT = 2

export function toUserTier(value: string | null | undefined, fallback: UserTier = 'free'): UserTier {
  return value === 'free' || value === 'vip' || value === 'vip_plus' ? value : fallback
}

export function tierRank(tier: string | null | undefined): number {
  return tierOrder[toUserTier(tier)]
}

export function canAccessPackage(
  userTier: string | null | undefined,
  minTier: string | null | undefined,
  options: { assigned?: boolean; isAdmin?: boolean } = {},
): boolean {
  if (options.isAdmin || options.assigned) return true
  return tierRank(userTier) >= tierRank(minTier)
}

export function freeAttemptsRemaining(
  tier: string | null | undefined,
  used: number,
  isAdmin = false,
): number {
  if (isAdmin || tierRank(tier) > 0) return -1
  return Math.max(0, FREE_ATTEMPT_LIMIT - used)
}
