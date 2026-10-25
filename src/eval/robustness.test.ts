import { describe, expect, it } from 'vitest'
import { summarizeRobustness, type VariantRow } from './robustness'

const row = (name: string, group: VariantRow['group'], over: Partial<VariantRow> = {}): VariantRow => ({
  name,
  group,
  ok: true,
  lengthToWidth: 1.4,
  foreheadToCheek: 0.88,
  jawToCheek: 0.78,
  chinAngle: 110,
  jawAngularity: 20,
  primary: 'oval',
  undertone: 'cool',
  depth: 'tan',
  confidence: 0.9,
  ...over,
})

describe('summarizeRobustness', () => {
  const rows = [
    row('original', 'original'),
    row('scale 0.5', 'scale', { lengthToWidth: 1.42 }),
    row('scale 1.25', 'scale', { lengthToWidth: 1.38 }),
    row('dark', 'light', { lengthToWidth: 1.41, depth: 'brown', confidence: 0.6 }),
    row('rot 6', 'rotation', { lengthToWidth: 1.46, primary: 'oblong' }),
    row('no face', 'crop', { ok: false, lengthToWidth: undefined, primary: undefined }),
  ]
  const s = summarizeRobustness(rows)

  it('counts variants and the ones that found a face', () => {
    expect(s.variants).toBe(6)
    expect(s.withFace).toBe(5)
  })

  it('spreads each feature over the variants that found a face', () => {
    expect(s.features.lengthToWidth.n).toBe(5)
    expect(s.features.lengthToWidth.min).toBe(1.38)
    expect(s.features.lengthToWidth.max).toBe(1.46)
    expect(s.features.chinAngle.std).toBe(0)
  })

  it('shows how far each group moved length / width from the original', () => {
    expect(s.lengthToWidthShiftByGroup.scale).toBeCloseTo(0.02, 9)
    expect(s.lengthToWidthShiftByGroup.light).toBeCloseTo(0.01, 9)
    expect(s.lengthToWidthShiftByGroup.rotation).toBeCloseTo(0.06, 9)
    expect(s.lengthToWidthShiftByGroup.crop).toBeUndefined() // that variant found no face
  })

  it('lists exactly which variants changed shape, undertone or depth, and how', () => {
    expect(s.changed).toEqual([
      { name: 'dark', what: ['depth tan to brown'] },
      { name: 'rot 6', what: ['shape oval to oblong'] },
    ])
    expect(s.shapes).toEqual({ oval: 4, oblong: 1 })
    expect(s.shapeFlipRate).toBeCloseTo(0.2, 9)
    expect(s.depthFlipRate).toBeCloseTo(0.2, 9)
    expect(s.undertoneFlipRate).toBe(0)
  })

  it('works when nothing found a face', () => {
    const none = summarizeRobustness([row('a', 'original', { ok: false })])
    expect(none.withFace).toBe(0)
    expect(none.changed).toEqual([])
    expect(none.shapeFlipRate).toBeNaN()
  })
})
