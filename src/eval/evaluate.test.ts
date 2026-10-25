import { describe, expect, it } from 'vitest'
import { analyzeFace } from '../core/analyze'
import { EVAL } from '../core/config/eval'
import { FACE_SHAPES, type FaceShape } from '../core/config/faceShapes'
import { buildReport, evalColor, evalFaceShape, evalPerf, evalRatings, evalStability } from './evaluate'
import type { ColorSummary, EvalFixture, LabelRow, PerfEntry, RatingRow } from './fixtures'
import { renderReport } from './report'
import { fixtureOf, sweep, warp } from './testing'

const predictedOf = (f: EvalFixture) => analyzeFace(f.landmarks, f.size, f.pose).shape.primary
const other = (s: FaceShape): FaceShape => FACE_SHAPES.find((x) => x !== s) as FaceShape
const unanimous = (id: string, s: FaceShape): LabelRow => ({ id, votes: [s, s, s] })

describe('1. face shape against labelers', () => {
  const faces = sweep(40)

  it('computes accuracy exactly from the labels (30 of 40 matching = 75%)', () => {
    const labels = faces.map((f, i) => unanimous(f.id, i < 30 ? predictedOf(f) : other(predictedOf(f))))
    const e = evalFaceShape(faces, labels)
    expect(e.status).toBe('ok')
    expect(e.items).toBe(40)
    expect(e.withConsensus).toBe(40)
    expect(e.top1).toBeCloseTo(0.75, 9)
    expect(e.top2).toBeGreaterThanOrEqual(e.top1)
    expect(e.confusion!.total).toBe(40)
    const diag = e.confusion!.counts.reduce((s, row, i) => s + (row[i] as number), 0)
    expect(diag).toBe(30)
    expect(e.agreement.unanimous).toBe(40)
    expect(e.agreement.pairwise).toBe(1)
    expect(e.agreement.labelerVsMajority).toBe(1)
  })

  it('top-2 can be right where top-1 is wrong', () => {
    const labels = faces.map((f) => unanimous(f.id, analyzeFace(f.landmarks, f.size, f.pose).shape.secondary))
    const e = evalFaceShape(faces, labels)
    expect(e.top1).toBe(0)
    expect(e.top2).toBe(1)
  })

  it('split votes: a 2-1 majority counts, an all-different vote is left out and listed', () => {
    const [a, b, c, ...rest] = faces as [EvalFixture, EvalFixture, EvalFixture, ...EvalFixture[]]
    const pa = predictedOf(a)
    const labels: LabelRow[] = [
      { id: a.id, votes: [pa, pa, other(pa)] },
      { id: b.id, votes: ['oval', 'round', 'square'] },
      unanimous(c.id, predictedOf(c)),
      ...rest.map((f) => unanimous(f.id, predictedOf(f))),
    ]
    const e = evalFaceShape(faces, labels)
    expect(e.noConsensusIds).toEqual([b.id])
    expect(e.withConsensus).toBe(39)
    expect(e.agreement.unanimous).toBe(38)
    expect(e.top1).toBe(1)
    // One of the three labelers disagreed with the majority on one face; two of the other ... on b nobody counts.
    expect(e.agreement.labelerVsMajority).toBeCloseTo(116 / 117, 9)
  })

  it('"matches at least one labeler" is kinder than top-1 on a split label', () => {
    const f = faces[0]!
    const p = predictedOf(f)
    const e = evalFaceShape([f], [{ id: f.id, votes: [other(p), other(p), p] }])
    expect(e.top1).toBe(0) // the majority said something else
    expect(e.matchesAnyLabeler).toBe(1) // but one labeler agreed with the app
  })

  it('says "no data" with nothing, and "not enough" below the minimum, without calling either a result', () => {
    expect(evalFaceShape([], []).status).toBe('no-data')
    const few = faces.slice(0, 10)
    const e = evalFaceShape(few, few.map((f) => unanimous(f.id, predictedOf(f))))
    expect(e.status).toBe('insufficient')
    expect(e.message).toMatch(new RegExp(`Only 10 .* needs at least ${EVAL.minShapeItems}`))
  })

  it('reports ids that do not match, in both directions', () => {
    const e = evalFaceShape(faces.slice(0, 2), [unanimous(faces[0]!.id, 'oval'), unanimous('typo', 'oval')])
    expect(e.labelsWithoutFixture).toEqual(['typo'])
    expect(e.fixturesWithoutLabel).toEqual([faces[1]!.id])
    expect(e.items).toBe(1)
  })
})

describe('2. measurement stability', () => {
  // The same face, ten times, with a little landmark jitter each time.
  const captures = (n: number, jitter: number) => Array.from({ length: n }, (_, i) => fixtureOf(`c${i}`, warp(1, 1, jitter, i + 1)))

  it('reports spread per feature and says how often the shape flips', () => {
    const e = evalStability({ p01: captures(10, 0.004) })
    expect(e.status).toBe('ok')
    const p = e.people[0]!
    expect(p.captures).toBe(10)
    expect(p.features.lengthToWidth.std).toBeGreaterThan(0)
    expect(p.features.lengthToWidth.std).toBeLessThan(0.1)
    expect(p.shapeFlipRate).toBe(0)
    expect(e.meanShapeFlipRate).toBe(0)
  })

  it('more jitter means more spread (the figure responds)', () => {
    const calm = evalStability({ p: captures(10, 0.002) }).people[0]!.features.lengthToWidth.std
    const shaky = evalStability({ p: captures(10, 0.02) }).people[0]!.features.lengthToWidth.std
    expect(shaky).toBeGreaterThan(calm * 3)
  })

  it('detects a shape that flips between captures', () => {
    const mixed = [...sweep(5, 0.75, 0.8), ...sweep(5, 1.3, 1.35)]
    const e = evalStability({ p: mixed })
    expect(e.people[0]!.shapeFlipRate).toBeGreaterThan(0)
  })

  it('"not enough" under ten captures of one person, "no data" with none', () => {
    expect(evalStability({ p: captures(4, 0.004) }).status).toBe('insufficient')
    expect(evalStability({}).status).toBe('no-data')
    expect(evalStability({ p: captures(1, 0) }).people).toHaveLength(0) // one capture has no spread
  })
})

describe('3. color stability across lighting', () => {
  const color = (L: number, hue: number, over: Partial<ColorSummary> = {}): ColorSummary => ({
    skinLab: [L, 20 * Math.cos((hue * Math.PI) / 180), 20 * Math.sin((hue * Math.PI) / 180)],
    hueDeg: hue,
    undertone: hue < 49 ? 'cool' : hue > 58 ? 'warm' : 'neutral',
    warmth: 0.5,
    depth: 'tan',
    confidence: 0.9,
    confidenceLevel: 'High',
    ...over,
  })
  const face = (c: ColorSummary) => fixtureOf('x', warp(1, 1), undefined, c)

  it('measures the shift from the daylight reference', () => {
    const e = evalColor({
      p01: {
        daylight: face(color(56, 52)),
        'indoor-warm': face(color(52, 62, { confidence: 0.6 })),
        'indoor-cool': face(color(48, 40, { confidence: 0.7 })),
      },
    })
    expect(e.status).toBe('ok')
    expect(e.rows).toHaveLength(2)
    const warm = e.rows.find((r) => r.condition === 'indoor-warm')!
    expect(warm.reference).toBe('daylight')
    expect(warm.hueShiftDeg).toBeCloseTo(10, 9)
    expect(warm.deltaE).toBeGreaterThan(5)
    expect(warm.undertoneFlip).toBe(true) // neutral -> warm
    expect(e.flips).toBe(2)
    expect(e.confidenceLower).toBe(2)
    expect(e.confidenceNoticedBigDrift).toEqual({ noticed: 2, of: 2 })
  })

  it('shows a confidence that did NOT notice a big drift', () => {
    const e = evalColor({ p: { daylight: face(color(56, 52)), a: face(color(40, 62)), b: face(color(56, 52)) } })
    expect(e.confidenceNoticedBigDrift.noticed).toBe(0) // confidence stayed at 0.9 everywhere
    expect(e.confidenceNoticedBigDrift.of).toBe(1)
  })

  it('uses the alphabetically first condition when there is no daylight shot, and flags too few conditions', () => {
    const e = evalColor({ p: { 'b-lamp': face(color(50, 55)), 'a-window': face(color(56, 52)) } })
    expect(e.rows[0]!.reference).toBe('a-window')
    expect(e.status).toBe('insufficient')
    expect(evalColor({}).status).toBe('no-data')
  })

  it('wraps hue differences across 0/360', () => {
    const e = evalColor({ p: { daylight: face(color(56, 355)), warm: face(color(56, 5)), x: face(color(56, 5)) } })
    expect(e.rows.find((r) => r.condition === 'warm')!.hueShiftDeg).toBeCloseTo(10, 9)
  })
})

describe('4. user ratings', () => {
  const rows = (participants: number, top: number[], random: number[]): RatingRow[] =>
    Array.from({ length: participants }, (_, p) => [
      ...top.map((rating, i): RatingRow => ({ participant: `p${p}`, trial: i, style: 's', color: 'c', size: 'M', arm: 'top', rank: i + 1, rating })),
      ...random.map((rating, i): RatingRow => ({ participant: `p${p}`, trial: i + 3, style: 's', color: 'c', size: 'M', arm: 'random', rank: 9, rating })),
    ]).flat()

  it('compares the arms within each person', () => {
    const e = evalRatings(rows(6, [4, 5, 4], [2, 3, 2]))
    expect(e.status).toBe('ok')
    expect(e.participants).toBe(6)
    expect(e.result!.meanA).toBeCloseTo(13 / 3, 9)
    expect(e.result!.meanB).toBeCloseTo(7 / 3, 9)
    expect(e.result!.meanDiff).toBeCloseTo(2, 9)
    expect(e.result!.ci95[0]).toBeGreaterThan(0)
    expect(e.result!.favorA).toBe(6)
  })

  it('an interval around zero when the picks are no better than random', () => {
    const noisy = [...rows(3, [4, 3, 4], [3, 4, 3]), ...rows(3, [3, 4, 3], [4, 3, 4]).map((r) => ({ ...r, participant: r.participant + 'b' }))]
    const e = evalRatings(noisy)
    expect(e.result!.ci95[0]).toBeLessThanOrEqual(0)
    expect(e.result!.ci95[1]).toBeGreaterThanOrEqual(0)
  })

  it('not enough with under five participants; someone with too few ratings in an arm is left out and named', () => {
    expect(evalRatings(rows(4, [4, 4, 4], [2, 2, 2])).status).toBe('insufficient')
    const partial = [...rows(5, [4, 4, 4], [2, 2, 2]), ...rows(1, [5, 5], [1, 1, 1]).map((r) => ({ ...r, participant: 'short' }))]
    const e = evalRatings(partial)
    expect(e.excluded).toEqual(['short'])
    expect(e.participants).toBe(5)
    expect(evalRatings([]).status).toBe('no-data')
  })
})

describe('5. performance', () => {
  const entry = (kind: PerfEntry['kind']): PerfEntry => ({ device: kind, kind, modelLoadMs: 800, firstDetectionMs: 60, detectFrames: 100, detectMsMedian: 12, detectMsP95: 30, detectFps: 60 })

  it('wants a phone as well as a laptop, as the brief says', () => {
    expect(evalPerf([]).status).toBe('no-data')
    const laptopOnly = evalPerf([entry('laptop'), entry('other')])
    expect(laptopOnly.status).toBe('insufficient')
    expect(laptopOnly.message).toMatch(/phone/)
    expect(evalPerf([entry('laptop'), entry('phone')]).status).toBe('ok')
  })
})

describe('the whole report', () => {
  const empty = { shape: { fixtures: [], labels: [] }, stability: {}, color: {}, ratings: [], perf: [] }

  it('with no data, every section says so and nothing reads as a result', () => {
    const md = renderReport(buildReport(empty), null, '2026-01-01')
    expect(md.match(/\*\*No data yet\.\*\*/g)).toHaveLength(5)
    expect(md).toMatch(/nothing was tuned/)
    expect(md).not.toMatch(/Top-1 accuracy/)
    expect(md).not.toMatch(/Confusion matrix/)
  })

  it('with data, it prints the confusion matrix and the agreement table', () => {
    const faces = sweep(40)
    const labels = faces.map((f) => unanimous(f.id, predictedOf(f)))
    const md = renderReport(buildReport({ ...empty, shape: { fixtures: faces, labels } }), null, '2026-01-01')
    expect(md).toMatch(/Confusion matrix/)
    expect(md).toMatch(/Top-1 accuracy \| 100\.0%/)
    expect(md).toMatch(/Data meets the minimum/)
  })

  it('a thin section is bannered as such even when it prints numbers', () => {
    const faces = sweep(8)
    const md = renderReport(buildReport({ ...empty, shape: { fixtures: faces, labels: faces.map((f) => unanimous(f.id, predictedOf(f))) } }), null, '2026-01-01')
    expect(md).toMatch(/Not enough data to draw conclusions\.\*\* Only 8/)
  })
})
