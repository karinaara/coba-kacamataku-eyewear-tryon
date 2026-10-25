import { describe, expect, it } from 'vitest'
import { analyzeFace } from '../core/analyze'
import { FIXTURES } from '../core/fixtures'
import { EMPTY_PREFS } from '../core/preferences'
import { recommend } from '../core/recommend'
import { evalRatings } from './evaluate'
import { parseRatings } from './fixtures'
import { buildTrials, ratingRows, ratingsCsv, seedFrom, TRIALS_PER_ARM } from './study'

const f = FIXTURES[0]!
const a = analyzeFace(f.landmarks, f.size, f.pose)
const recs = recommend({ shape: a.shape, scale: a.scale, profile: null, prefs: EMPTY_PREFS })

describe('buildTrials', () => {
  const trials = buildTrials(recs, 'p01')

  it('gives three from each arm', () => {
    expect(trials).toHaveLength(2 * TRIALS_PER_ARM)
    expect(trials.filter((t) => t.arm === 'top')).toHaveLength(3)
    expect(trials.filter((t) => t.arm === 'random')).toHaveLength(3)
  })

  it('the top arm is the engine\'s top three styles, each in its best color and suggested size', () => {
    const top = trials.filter((t) => t.arm === 'top').sort((x, y) => x.rank - y.rank)
    expect(top.map((t) => t.styleId)).toEqual(recs.topStyles.map((s) => s.styleId))
    for (const t of top) {
      expect(t.colorId).toBe(recs.bestColorFor(t.styleId).colorId)
      expect(t.size).toBe(recs.styleById.get(t.styleId)!.bestSize)
    }
  })

  it('the random arm comes from outside the top three, with no repeats, and the same size rule', () => {
    const topIds = new Set(recs.topStyles.map((s) => s.styleId))
    const random = trials.filter((t) => t.arm === 'random')
    expect(new Set(random.map((t) => t.styleId)).size).toBe(3)
    for (const t of random) {
      expect(topIds.has(t.styleId)).toBe(false)
      expect(t.rank).toBeGreaterThan(3)
      expect(t.size).toBe(recs.styleById.get(t.styleId)!.bestSize)
    }
  })

  it('is the same for the same participant and different for another', () => {
    expect(buildTrials(recs, 'p01')).toEqual(trials)
    const other = buildTrials(recs, 'p02')
    expect(other.map((t) => `${t.styleId}/${t.colorId}`)).not.toEqual(trials.map((t) => `${t.styleId}/${t.colorId}`))
  })

  it('shuffles, so the top picks are not always shown first', () => {
    const firstArms = new Set(Array.from({ length: 12 }, (_, i) => buildTrials(recs, `person${i}`)[0]!.arm))
    expect(firstArms.size).toBe(2)
    const positions = Array.from({ length: 12 }, (_, i) => buildTrials(recs, `q${i}`).findIndex((t) => t.rank === 1))
    expect(new Set(positions).size).toBeGreaterThan(2)
  })

  it('seeds differ for different codes', () => {
    expect(seedFrom('p01')).not.toBe(seedFrom('p02'))
    expect(seedFrom('p01')).toBe(seedFrom('p01'))
  })
})

describe('CSV export', () => {
  it('round-trips through the parser the evaluation uses', () => {
    const trials = buildTrials(recs, 'p07')
    const rows = ratingRows('p07', trials, [5, 4, 4, 2, 1, 3])
    const parsed = parseRatings(ratingsCsv(rows))
    expect(parsed).toEqual(rows)
    expect(parsed[0]).toMatchObject({ participant: 'p07', trial: 1 })
  })

  it('can leave out the header when appending to an existing file', () => {
    const csv = ratingsCsv(ratingRows('p1', buildTrials(recs, 'p1'), [3, 3, 3, 3, 3, 3]), false)
    expect(csv.startsWith('participant')).toBe(false)
    expect(csv.trim().split('\n')).toHaveLength(6)
  })

  it('feeds the evaluation end to end: raters who prefer the top picks show a positive gap', () => {
    const rows = Array.from({ length: 6 }, (_, p) => {
      const trials = buildTrials(recs, `p${p}`)
      return ratingRows(`p${p}`, trials, trials.map((t) => (t.arm === 'top' ? 4 : 2)))
    }).flat()
    const e = evalRatings(parseRatings(ratingsCsv(rows)))
    expect(e.status).toBe('ok')
    expect(e.result!.meanDiff).toBeCloseTo(2, 9)
    expect(e.result!.favorA).toBe(6)
  })
})
