import { describe, expect, it } from 'vitest'
import {
  angleDiffDeg,
  confusionMatrix,
  deltaE76,
  fleissKappa,
  flipRate,
  logLoss,
  majorityVote,
  mean,
  median,
  pairedComparison,
  pairwiseAgreement,
  perClass,
  seeded,
  spread,
  std,
  topKAccuracy,
} from './metrics'

describe('basic statistics', () => {
  it('mean, sample std and median', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3) // n - 1
    expect(std([5])).toBeNaN()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(mean([])).toBeNaN()
  })

  it('spread summarizes a list', () => {
    const s = spread([10, 12, 14])
    expect(s).toMatchObject({ n: 3, mean: 12, min: 10, max: 14 })
    expect(s.std).toBeCloseTo(2, 9)
    expect(s.cv).toBeCloseTo(2 / 12, 9)
  })

  it('the seeded generator is reproducible and spread out', () => {
    const a = seeded(5)
    const b = seeded(5)
    const xs = Array.from({ length: 1000 }, () => a())
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()))
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(mean(xs)).toBeGreaterThan(0.45)
    expect(mean(xs)).toBeLessThan(0.55)
  })
})

describe('classification metrics', () => {
  const labels = ['a', 'b', 'c']
  const truth = ['a', 'a', 'a', 'b', 'b', 'c']
  const pred = ['a', 'a', 'b', 'b', 'c', 'c']

  it('confusion matrix counts truth by prediction', () => {
    const c = confusionMatrix(labels, truth, pred)
    expect(c.counts).toEqual([[2, 1, 0], [0, 1, 1], [0, 0, 1]])
    expect(c.total).toBe(6)
  })

  it('rejects unknown labels and mismatched lengths', () => {
    expect(() => confusionMatrix(labels, ['z'], ['a'])).toThrow(/Unknown label/)
    expect(() => confusionMatrix(labels, ['a'], [])).toThrow(/same length/)
  })

  it('per-class precision and recall', () => {
    const s = perClass(confusionMatrix(labels, truth, pred))
    expect(s.a).toEqual({ precision: 1, recall: 2 / 3, support: 3 })
    expect(s.b).toEqual({ precision: 0.5, recall: 0.5, support: 2 })
    expect(s.c).toEqual({ precision: 0.5, recall: 1, support: 1 })
  })

  it('per-class gives NaN, not 0, where a class never occurs or is never predicted', () => {
    const s = perClass(confusionMatrix(['a', 'b'], ['a', 'a'], ['a', 'a']))
    expect(s.b!.precision).toBeNaN()
    expect(s.b!.recall).toBeNaN()
  })

  it('top-k accuracy uses the ranked probabilities', () => {
    const probs = [{ a: 0.6, b: 0.3, c: 0.1 }, { a: 0.2, b: 0.5, c: 0.3 }, { a: 0.1, b: 0.2, c: 0.7 }]
    const t = ['a', 'c', 'a']
    expect(topKAccuracy(t, probs, 1)).toBeCloseTo(1 / 3, 9)
    expect(topKAccuracy(t, probs, 2)).toBeCloseTo(2 / 3, 9) // second item: c is 2nd; third: a is last
    expect(topKAccuracy(t, probs, 3)).toBe(1)
    expect(topKAccuracy([], [], 1)).toBeNaN()
  })

  it('log loss: ln 2 for a coin flip, large for a confident miss, finite for a zero', () => {
    expect(logLoss(['a'], [{ a: 0.5, b: 0.5 }])).toBeCloseTo(Math.LN2, 9)
    expect(logLoss(['a'], [{ a: 0.01, b: 0.99 }])).toBeGreaterThan(4)
    expect(Number.isFinite(logLoss(['a'], [{ a: 0, b: 1 }]))).toBe(true)
  })
})

describe('labeler agreement', () => {
  it('majority needs strictly more than half', () => {
    expect(majorityVote(['a', 'a', 'b'])).toEqual({ label: 'a', votes: 2, of: 3 })
    expect(majorityVote(['a', 'b', 'c'])).toEqual({ label: null, votes: 1, of: 3 })
    expect(majorityVote(['a', 'a', 'b', 'b']).label).toBeNull() // a tie is not a majority
    expect(majorityVote(['a', 'a', 'a', 'b']).label).toBe('a')
    expect(majorityVote(['a']).label).toBe('a')
  })

  it('pairwise agreement', () => {
    expect(pairwiseAgreement([['a', 'a', 'a']])).toBe(1)
    expect(pairwiseAgreement([['a', 'b', 'c']])).toBe(0)
    expect(pairwiseAgreement([['a', 'a', 'b']])).toBeCloseTo(1 / 3, 9)
    expect(pairwiseAgreement([['a', 'a', 'a'], ['a', 'b', 'c']])).toBe(0.5)
  })

  it("Fleiss' kappa reproduces the textbook example (14 raters, 5 categories, 10 items: 0.210)", () => {
    const cats = ['1', '2', '3', '4', '5']
    const table = [
      [0, 0, 0, 0, 14], [0, 2, 6, 4, 2], [0, 0, 3, 5, 6], [0, 3, 9, 2, 0], [2, 2, 8, 1, 1],
      [7, 7, 0, 0, 0], [3, 2, 6, 3, 0], [2, 5, 3, 2, 2], [6, 5, 2, 1, 0], [0, 2, 2, 3, 7],
    ]
    const items = table.map((row) => row.flatMap((n, j) => Array<string>(n).fill(cats[j] as string)))
    expect(fleissKappa(items, cats)).toBeCloseTo(0.21, 2)
  })

  it('kappa is 1 for perfect agreement, below 0 for systematic disagreement, NaN without raters', () => {
    const cats = ['a', 'b', 'c']
    expect(fleissKappa([['a', 'a', 'a'], ['b', 'b', 'b'], ['c', 'c', 'c']], cats)).toBeCloseTo(1, 9)
    expect(fleissKappa([['a', 'b'], ['b', 'a'], ['a', 'b'], ['b', 'a']], ['a', 'b'])).toBeLessThan(0)
    expect(fleissKappa([], cats)).toBeNaN()
    expect(fleissKappa([['a']], cats)).toBeNaN()
    expect(() => fleissKappa([['a', 'a'], ['a']], cats)).toThrow(/same number of raters/)
  })

  it('agreement by chance sits near kappa 0', () => {
    const rand = seeded(11)
    const cats = ['a', 'b', 'c', 'd']
    const items = Array.from({ length: 400 }, () => Array.from({ length: 3 }, () => cats[Math.floor(rand() * 4)] as string))
    expect(Math.abs(fleissKappa(items, cats))).toBeLessThan(0.08)
  })
})

describe('stability and color helpers', () => {
  it('flip rate is the share that differs from the most common value', () => {
    expect(flipRate(['a', 'a', 'a', 'a'])).toBe(0)
    expect(flipRate(['a', 'a', 'a', 'b'])).toBe(0.25)
    expect(flipRate(['a', 'b'])).toBe(0.5)
    expect(flipRate([])).toBeNaN()
  })

  it('delta E and angle differences', () => {
    expect(deltaE76([50, 10, 10], [50, 13, 14])).toBeCloseTo(5, 9)
    expect(angleDiffDeg(10, 350)).toBe(20)
    expect(angleDiffDeg(350, 10)).toBe(-20)
    expect(angleDiffDeg(55, 47)).toBe(8)
    expect(angleDiffDeg(180, 0)).toBe(180)
    expect(angleDiffDeg(0, 180)).toBe(180)
  })
})

describe('paired comparison (rating study)', () => {
  it('summarizes within participants', () => {
    const r = pairedComparison([{ a: 4, b: 2 }, { a: 5, b: 3 }, { a: 3, b: 3 }, { a: 4, b: 5 }])
    expect(r.n).toBe(4)
    expect(r.meanA).toBe(4)
    expect(r.meanB).toBe(3.25)
    expect(r.meanDiff).toBeCloseTo(0.75, 9)
    expect([r.favorA, r.favorB, r.ties]).toEqual([2, 1, 1])
  })

  it('a unanimous gain gives a tight interval above zero; no gain gives an interval around zero', () => {
    const win = pairedComparison(Array.from({ length: 6 }, () => ({ a: 4, b: 2 })))
    expect(win.ci95).toEqual([2, 2])
    const noise = pairedComparison([{ a: 3, b: 4 }, { a: 4, b: 3 }, { a: 3, b: 4 }, { a: 4, b: 3 }, { a: 3, b: 3 }, { a: 4, b: 4 }])
    expect(noise.ci95[0]).toBeLessThanOrEqual(0)
    expect(noise.ci95[1]).toBeGreaterThanOrEqual(0)
  })

  it('is reproducible, and the interval is wider with fewer people', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ a: 3 + (i % 3), b: 3 }))
    const few = many.slice(0, 5)
    expect(pairedComparison(many, 2000, 7)).toEqual(pairedComparison(many, 2000, 7))
    const w = (p: ReturnType<typeof pairedComparison>) => p.ci95[1] - p.ci95[0]
    expect(w(pairedComparison(few))).toBeGreaterThan(w(pairedComparison(many)))
  })

  it('handles nobody without throwing', () => {
    const r = pairedComparison([])
    expect(r.n).toBe(0)
    expect(r.meanDiff).toBeNaN()
    expect(r.ci95[0]).toBeNaN()
  })
})
