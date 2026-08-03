import { Crown, Sparkles } from 'lucide-react'
import type { UserTier } from '../types'
import { tierLabels } from '../lib/tiers'

const tierStyles: Record<UserTier, string> = {
  free: 'bg-[#E6F0EB] text-[#006C35] border border-[#A7D7C0]',
  vip: 'bg-amber-100 text-amber-900 border border-amber-300',
  vip_plus: 'bg-amber-900 text-white border border-amber-950/40',
}

export function TierBadge({ tier, className = '' }: { tier: UserTier; className?: string }) {
  const Icon = tier === 'free' ? Sparkles : Crown
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${tierStyles[tier]} ${className}`}
    >
      <Icon size={12} aria-hidden />
      {tierLabels[tier]}
    </span>
  )
}
