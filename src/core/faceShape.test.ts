import { describe, expect, it } from 'vitest'
import { FACE_SHAPES, PROTOTYPES, type ChinCategory, type FaceShape } from './config/faceShapes'
import { explainFaceShape } from './explain'
import { FIXTURES } from './fixtures'
import { bestChinCategory, chinMemberships, classifyFaceShape, type ShapeInput } from './faceShape'
import { measureFace } from './measure'

/** Numbers that put a chin squarely in one category. */
const CHIN_NUMBERS: Record<ChinCategory, { chinAngle: number; jawAngularity: number }> = {
  soft: { chinAngle: 125, jawAngularity: 10 },
  angular: { chinAngle: 125, jawAngularity: 55 },
  pointed: { chinAngle: 85, jawAngularity: 10 },
  mixed: { chinAngle: 102.5, jawAngularity: 35 },
}

const protoInput = (shape: FaceShape): ShapeInput => {
  const p = PROTOTYPES[shape]
  return { lengthToWidth: p.lengthToWidth, foreheadToCheek: p.foreheadToCheek, jawToCheek: p.jawToCheek, ...CHIN_NUMBERS[p.chin] }
}

describe('chinMemberships', () => {
  it.each(Object.keys(CHIN_NUMBERS) as ChinCategory[])('recognizes a %s chin', (cat) => {
    const m = chinMemberships(CHIN_NUMBERS[cat].chinAngle, CHIN_NUMBERS[cat].jawAngularity)
    expect(bestChinCategory(m)).toBe(cat)
  })
})

describe('classifyFaceShape', () => {
  it.each(FACE_SHAPES)('puts a perfect %s prototype first', (shape) => {
    const r = classifyFaceShape(protoInput(shape))
    expect(r.primary).toBe(shape)
    expect(r.secondary).not.toBe(shape)
  })

  it('returns probabilities that are positive and sum to 1', () => {
    for (const shape of FACE_SHAPES) {
      const r = classifyFaceShape(protoInput(shape))
      const values = Object.values(r.probabilities)
      expect(values.every((v) => v > 0 && v < 1)).toBe(true)
      expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    }
  })

  it('is soft: a face between two prototypes splits probability and is flagged "between"', () => {
    const o = PROTOTYPES.oval
    const b = PROTOTYPES.oblong
    const mid: ShapeInput = {
      lengthToWidth: (o.lengthToWidth + b.lengthToWidth) / 2,
      foreheadToCheek: (o.foreheadToCheek + b.foreheadToCheek) / 2,
      jawToCheek: (o.jawToCheek + b.jawToCheek) / 2,
      ...CHIN_NUMBERS.mixed,
    }
    const r = classifyFaceShape(mid)
    expect(new Set([r.primary, r.secondary])).toEqual(new Set(['oval', 'oblong']))
    // The runner-up keeps real probability instead of being squeezed to ~0.
    expect(r.probabilities[r.secondary]).toBeGreaterThan(0.15)
    expect(r.probabilities[r.primary]).toBeLessThan(0.8)
  })

  it('gives a near-tie for a face midway between oval and round', () => {
    // Length halfway between round and oval, everything else neutral between them.
    const a = PROTOTYPES.oval
    const b = PROTOTYPES.round
    const r = classifyFaceShape({
      lengthToWidth: (a.lengthToWidth + b.lengthToWidth) / 2,
      foreheadToCheek: (a.foreheadToCheek + b.foreheadToCheek) / 2,
      jawToCheek: (a.jawToCheek + b.jawToCheek) / 2,
      ...CHIN_NUMBERS.soft,
    })
    expect(r.probabilities[r.primary] - r.probabilities[r.secondary]).toBeLessThan(0.1)
  })

  it('shifts toward oblong and away from round as the face gets longer', () => {
    const base = protoInput('oval')
    const short = classifyFaceShape({ ...base, lengthToWidth: 1.2 })
    const long = classifyFaceShape({ ...base, lengthToWidth: 1.6 })
    expect(long.probabilities.oblong).toBeGreaterThan(short.probabilities.oblong)
    expect(long.probabilities.round).toBeLessThan(short.probabilities.round)
  })

  it('a narrower jaw raises heart', () => {
    const base = protoInput('oval')
    const wide = classifyFaceShape({ ...base, jawToCheek: 0.85 })
    const narrow = classifyFaceShape({ ...base, jawToCheek: 0.62 })
    expect(narrow.probabilities.heart).toBeGreaterThan(wide.probabilities.heart)
  })

  it('reports signed deviations in sigma units (zero at the prototype)', () => {
    const r = classifyFaceShape(protoInput('round'))
    expect(r.deviations.round.lengthToWidth).toBeCloseTo(0, 10)
    expect(r.deviations.round.jawToCheek).toBeCloseTo(0, 10)
    expect(r.deviations.oblong.lengthToWidth).toBeLessThan(0) // face is shorter than oblong's prototype
  })
})

describe('real fixtures', () => {
  for (const f of FIXTURES) {
    it(`${f.id}: classifies into a valid distribution (label: ${f.label ?? 'none - no accuracy claim'})`, () => {
      const m = measureFace(f.landmarks, f.size, f.pose)
      const r = classifyFaceShape(m)
      expect(Object.values(r.probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
      expect(r.primary).not.toBe(r.secondary)
      if (f.label) expect(r.primary).toBe(f.label)
    })
  }
})

describe('explainFaceShape', () => {
  const m = protoInput('heart')
  const r = classifyFaceShape(m)
  const why = explainFaceShape(m, r)

  it('gives a bar row per proportion with the primary and secondary markers', () => {
    expect(why.rows.map((x) => x.id)).toEqual(['lengthToWidth', 'foreheadToCheek', 'jawToCheek'])
    for (const row of why.rows) {
      expect(row.markers.map((k) => k.shape)).toEqual([r.primary, r.secondary])
      expect(row.scale.max).toBeGreaterThan(row.scale.min)
    }
  })

  it('marks a perfect prototype as a close match on every row', () => {
    expect(why.rows.every((x) => x.closeness === 'close')).toBe(true)
    expect(why.chin.matches).toBe(true)
  })

  it('writes one plain-English reason per rule, using the real numbers', () => {
    expect(why.reasons).toHaveLength(4)
    expect(why.reasons[0]).toContain('1.40')
    expect(why.reasons[1]).toContain('95%')
    expect(why.reasons.join(' ')).toMatch(/Heart/)
  })

  it('explains the hairline estimate and that these are suggestions', () => {
    expect(why.notes.join(' ')).toMatch(/estimated hairline/)
    expect(why.notes.join(' ')).toMatch(/not rules/)
  })

  it('flags a chin that disagrees with the shape', () => {
    const odd = { ...protoInput('heart'), ...CHIN_NUMBERS.angular }
    const res = classifyFaceShape(odd)
    const text = explainFaceShape(odd, res)
    expect(text.chin.category).toBe('angular')
    expect(text.reasons[3]).toMatch(/chin/)
  })
})
