import { describe, expect, it } from 'vitest'
import { analyzeFace } from './analyze'
import { FIXTURES } from './fixtures'

describe('analyzeFace', () => {
  const f = FIXTURES[0]!
  const a = analyzeFace(f.landmarks, f.size, f.pose)

  it('wires measurements, classifier and explanation together', () => {
    expect(a.shape.primary).not.toBe(a.shape.secondary)
    expect(a.why.rows).toHaveLength(3)
    expect(a.why.rows[0]!.value).toBe(a.measurements.lengthToWidth)
    expect(a.why.reasons[0]).toContain(a.measurements.lengthToWidth.toFixed(2))
  })

  it('is deterministic', () => {
    const b = analyzeFace(f.landmarks, f.size, f.pose)
    expect(b.shape.probabilities).toEqual(a.shape.probabilities)
  })
})
