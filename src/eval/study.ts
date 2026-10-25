// The rating study (brief section 9, item 4): each person rates the app's top 3 frames and 3 random
// frames, shuffled so they cannot tell which are which. Trial selection and CSV export are pure.

import { FRAME_COLORS } from '../core/config/colors'
import type { SizeId } from '../core/config/frames'
import type { Recommendations } from '../core/recommend'
import { RATING_HEADER, type Arm, type RatingRow } from './fixtures'
import { seeded } from './metrics'

export interface Trial {
  styleId: string
  colorId: string
  size: SizeId
  arm: Arm
  /** Where the engine ranked the style (1 = best). */
  rank: number
}

export const TRIALS_PER_ARM = 3

/** FNV-1a, to turn a participant code into a seed. */
export function seedFrom(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Builds the six trials for one participant. The top arm is the engine's top styles, each in its best
 * color. The random arm is styles from OUTSIDE the top group, with random colors. Both arms use each
 * style's own suggested size, so size never separates them.
 */
export function buildTrials(recs: Recommendations, participant: string): Trial[] {
  const rand = seeded(seedFrom(participant))
  const rankOf = new Map(recs.styles.map((s, i) => [s.styleId, i + 1]))
  const top = recs.styles.slice(0, TRIALS_PER_ARM)
  const rest = recs.styles.slice(TRIALS_PER_ARM)

  const pool = [...rest]
  const picked: typeof rest = []
  while (picked.length < TRIALS_PER_ARM && pool.length) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0] as (typeof rest)[number])

  const trials: Trial[] = [
    ...top.map((s): Trial => ({ styleId: s.styleId, colorId: recs.bestColorFor(s.styleId).colorId, size: s.bestSize, arm: 'top', rank: rankOf.get(s.styleId) as number })),
    ...picked.map((s): Trial => ({ styleId: s.styleId, colorId: FRAME_COLORS[Math.floor(rand() * FRAME_COLORS.length)]!.id, size: s.bestSize, arm: 'random', rank: rankOf.get(s.styleId) as number })),
  ]
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[trials[i], trials[j]] = [trials[j] as Trial, trials[i] as Trial]
  }
  return trials
}

/** The rows for ratings.csv. `ratings[i]` belongs to `trials[i]`. */
export function ratingRows(participant: string, trials: readonly Trial[], ratings: readonly number[]): RatingRow[] {
  return trials.map((t, i) => ({ participant, trial: i + 1, style: t.styleId, color: t.colorId, size: t.size, arm: t.arm, rank: t.rank, rating: ratings[i] as number }))
}

export function ratingsCsv(rows: readonly RatingRow[], withHeader = true): string {
  const lines = rows.map((r) => [r.participant, r.trial, r.style, r.color, r.size, r.arm, r.rank, r.rating].join(','))
  return (withHeader ? [RATING_HEADER, ...lines] : lines).join('\n') + '\n'
}
