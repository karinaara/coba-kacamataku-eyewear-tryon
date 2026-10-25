import { SIZES, type SizeId } from '../core/config/frames'

/** A label instead of a percentage: the reasons carry the detail. */
export function matchLabel(score: number): string {
  if (score >= 0.78) return 'Strong match'
  if (score >= 0.66) return 'Good match'
  if (score >= 0.55) return 'Worth a try'
  return 'Less suited'
}

export const sizeName = (id: SizeId) => SIZES.find((s) => s.id === id)?.name ?? id
