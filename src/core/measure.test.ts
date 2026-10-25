import { describe, expect, it } from 'vitest'
import { MEASURE } from './config/measure'
import { FIXTURES } from './fixtures'
import type { Point3 } from './landmarks'
import { measureFace, MEASURE_LINES } from './measure'

const fixture = FIXTURES[0]!
const { size, landmarks, pose } = fixture

/** Re-project the fixture as if the head were tilted (roll) and turned (yaw) by squashing x. */
function transformed(rollDeg: number, yawDeg: number): Point3[] {
  const r = (rollDeg * Math.PI) / 180
  const sx = Math.cos((yawDeg * Math.PI) / 180)
  return landmarks.map((p) => {
    const x = (p.x - 0.5) * size.width * sx
    const y = (p.y - 0.5) * size.height
    return {
      x: 0.5 + (x * Math.cos(r) - y * Math.sin(r)) / size.width,
      y: 0.5 + (x * Math.sin(r) + y * Math.cos(r)) / size.height,
      z: p.z,
    }
  })
}

const base = measureFace(landmarks, size, null)

describe('measureFace on the real fixture', () => {
  it('produces sane proportions', () => {
    expect(base.lengthToWidth).toBeGreaterThan(1.0)
    expect(base.lengthToWidth).toBeLessThan(1.9)
    expect(base.foreheadToCheek).toBeGreaterThan(0.6)
    expect(base.foreheadToCheek).toBeLessThan(1.1)
    expect(base.jawToCheek).toBeGreaterThan(0.5)
    expect(base.jawToCheek).toBeLessThan(1.05)
    expect(base.chinAngle).toBeGreaterThan(60)
    expect(base.chinAngle).toBeLessThan(170)
    expect(base.jawToForehead).toBeCloseTo(base.jawWidth / base.foreheadWidth, 10)
  })

  it('regression: values for test1 (not an accuracy claim)', () => {
    const m = measureFace(landmarks, size, pose)
    expect(m.lengthToWidth).toBeCloseTo(1.39, 1)
    expect(m.foreheadToCheek).toBeCloseTo(0.88, 1)
    expect(m.jawToCheek).toBeCloseTo(0.78, 1)
    expect(m.chinAngle).toBeCloseTo(110, -1)
  })

  it('face length scales with the hairline extension, other widths do not', () => {
    const a = measureFace(landmarks, size, null, { hairlineExtension: 1.0 })
    const b = measureFace(landmarks, size, null, { hairlineExtension: 1.3 })
    expect(b.lengthToWidth / a.lengthToWidth).toBeCloseTo(1.3, 6)
    expect(b.cheekWidth).toBeCloseTo(a.cheekWidth, 8)
    expect(base.faceLength).toBeCloseTo(base.faceLengthMesh * MEASURE.hairlineExtension, 8)
  })

  it('measurement lines reference real landmarks', () => {
    for (const line of MEASURE_LINES) {
      expect(landmarks[line.a]).toBeDefined()
      expect(landmarks[line.b]).toBeDefined()
    }
  })
})

describe('pose normalization', () => {
  it('is unchanged by in-plane roll', () => {
    for (const roll of [-20, 12]) {
      const m = measureFace(transformed(roll, 0), size, null)
      expect(m.lengthToWidth).toBeCloseTo(base.lengthToWidth, 2)
      expect(m.jawToCheek).toBeCloseTo(base.jawToCheek, 2)
      expect(m.foreheadToCheek).toBeCloseTo(base.foreheadToCheek, 2)
    }
  })

  it('recovers proportions from a turned head when yaw is known', () => {
    const squashed = transformed(0, 20)
    const raw = measureFace(squashed, size, null)
    const fixed = measureFace(squashed, size, { yaw: 20, pitch: 0, roll: 0 })
    expect(Math.abs(raw.lengthToWidth - base.lengthToWidth)).toBeGreaterThan(0.05) // the problem is real
    expect(fixed.lengthToWidth).toBeCloseTo(base.lengthToWidth, 2)
  })

  it('handles roll and yaw together', () => {
    const m = measureFace(transformed(15, 12), size, { yaw: 12, pitch: 0, roll: 0 })
    expect(m.lengthToWidth).toBeCloseTo(base.lengthToWidth, 2)
    expect(m.foreheadToCheek).toBeCloseTo(base.foreheadToCheek, 2)
  })

  it('reports the correction it applied', () => {
    const m = measureFace(transformed(10, 0), size, { yaw: 3, pitch: -4, roll: 0 })
    // The photo's own eye-line tilt plus the 10 degrees added here.
    expect(m.correction.rollDeg).toBeCloseTo(base.correction.rollDeg + 10, 1)
    expect(m.correction.yawDeg).toBe(3)
    expect(m.correction.pitchDeg).toBe(-4)
  })
})
