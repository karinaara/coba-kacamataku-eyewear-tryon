import { describe, expect, it } from 'vitest'
import { poseFromMatrix } from './pose'

const rad = (d: number) => (d * Math.PI) / 180

/** Column-major 4x4 for R = Ry(yaw) * Rx(pitch) * Rz(roll), with uniform scale and a translation. */
function matrix(yaw: number, pitch: number, roll: number, scale = 1) {
  const [cy, sy, cx, sx, cz, sz] = [Math.cos(rad(yaw)), Math.sin(rad(yaw)), Math.cos(rad(pitch)), Math.sin(rad(pitch)), Math.cos(rad(roll)), Math.sin(rad(roll))] as const
  const r = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ] as const
  const col = (c: 0 | 1 | 2) => [r[0][c] * scale, r[1][c] * scale, r[2][c] * scale, 0]
  return [...col(0), ...col(1), ...col(2), 1, 2, 3, 1]
}

describe('poseFromMatrix', () => {
  it('identity is a frontal pose', () => {
    const p = poseFromMatrix(matrix(0, 0, 0))
    expect(p?.yaw).toBeCloseTo(0, 6)
    expect(p?.pitch).toBeCloseTo(0, 6)
    expect(p?.roll).toBeCloseTo(0, 6)
  })

  it.each([
    [20, 0, 0],
    [0, 15, 0],
    [0, 0, -12],
    [-25, 10, 7],
  ])('round-trips yaw=%d pitch=%d roll=%d', (yaw, pitch, roll) => {
    const p = poseFromMatrix(matrix(yaw, pitch, roll))
    expect(p?.yaw).toBeCloseTo(yaw, 4)
    expect(p?.pitch).toBeCloseTo(pitch, 4)
    expect(p?.roll).toBeCloseTo(roll, 4)
  })

  it('ignores uniform scale', () => {
    const p = poseFromMatrix(matrix(10, -5, 3, 12.5))
    expect(p?.yaw).toBeCloseTo(10, 4)
    expect(p?.pitch).toBeCloseTo(-5, 4)
    expect(p?.roll).toBeCloseTo(3, 4)
  })

  it('rejects malformed input', () => {
    expect(poseFromMatrix([1, 2, 3])).toBeNull()
    expect(poseFromMatrix(new Array(16).fill(0))).toBeNull()
  })
})
