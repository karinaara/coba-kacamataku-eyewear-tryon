import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { describe, expect, it } from 'vitest'
import { eulerDegrees, fitPointsFromScene, headBasis, SceneSmoother, toScene, trianglesFromEdges } from './headPose3d'

// A crude face: only the landmarks the head axes use, laid out like a frontal face (scene space, mm-ish units).
function fakeFace(yawDeg: number, pitchDeg = 0, rollDeg = 0): Float32Array {
  const pts = new Float32Array(478 * 3)
  const base: Record<number, [number, number, number]> = {
    33: [-45, 0, 0], // outer eye corner, image left
    263: [45, 0, 0],
    133: [-15, 0, 0],
    362: [15, 0, 0],
    152: [0, -90, 0], // chin
    10: [0, 70, 0], // top of mesh
    234: [-65, -10, -40],
    454: [65, -10, -40],
  }
  const ry = (yawDeg * Math.PI) / 180
  const rx = (pitchDeg * Math.PI) / 180
  const rz = (rollDeg * Math.PI) / 180
  for (const [i, [x, y, z]] of Object.entries(base)) {
    // Roll about z, then pitch about x, then yaw about y.
    let [a, b, c] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz), z]
    ;[b, c] = [b * Math.cos(rx) - c * Math.sin(rx), b * Math.sin(rx) + c * Math.cos(rx)]
    ;[a, c] = [a * Math.cos(ry) + c * Math.sin(ry), -a * Math.sin(ry) + c * Math.cos(ry)]
    pts.set([a, b, c], Number(i) * 3)
  }
  return pts
}

describe('headBasis', () => {
  it('a frontal face looks straight at the camera', () => {
    const b = headBasis(fakeFace(0))!
    expect(b.x).toEqual([1, 0, 0].map((v) => expect.closeTo(v, 5)))
    expect(b.y).toEqual([0, 1, 0].map((v) => expect.closeTo(v, 5)))
    expect(b.z).toEqual([0, 0, 1].map((v) => expect.closeTo(v, 5)))
  })

  it('recovers yaw, pitch and roll applied to the face', () => {
    for (const yaw of [-40, -15, 15, 30]) {
      expect(eulerDegrees(headBasis(fakeFace(yaw))!).yaw).toBeCloseTo(yaw, 1)
    }
    // Turning the face about +x by 20 degrees tips it down, and pitch is positive when the face looks up.
    expect(eulerDegrees(headBasis(fakeFace(0, 20))!).pitch).toBeCloseTo(-20, 1)
    expect(eulerDegrees(headBasis(fakeFace(0, 0, 12))!).roll).toBeCloseTo(12, 1)
  })

  it('returns orthonormal axes', () => {
    const b = headBasis(fakeFace(25, 10, 5))!
    const dot = (p: readonly number[], q: readonly number[]) => p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!
    expect(dot(b.x, b.y)).toBeCloseTo(0, 5)
    expect(dot(b.x, b.z)).toBeCloseTo(0, 5)
    expect(dot(b.y, b.z)).toBeCloseTo(0, 5)
    expect(dot(b.z, b.z)).toBeCloseTo(1, 5)
  })

  it('gives up on degenerate input instead of returning NaN axes', () => {
    expect(headBasis(new Float32Array(478 * 3))).toBeNull()
  })
})

describe('toScene', () => {
  it('flips y so up is up, and negates z so closer to the camera is larger', () => {
    const a = toScene([{ x: 0.5, y: 0.25, z: -0.1 }], 200, 100)
    expect([...a]).toEqual([100, 75, expect.closeTo(20, 4)])
  })
})

describe('fitPointsFromScene', () => {
  it('is the inverse of toScene for the 2D fit points', () => {
    const lm = Array.from({ length: 478 }, (_, i) => ({ x: (i % 20) / 20, y: Math.floor(i / 20) / 24, z: 0 }))
    const p = fitPointsFromScene(toScene(lm, 640, 480), 480)
    expect(p.irisRight.x).toBeCloseTo(lm[468]!.x * 640, 3)
    expect(p.irisRight.y).toBeCloseTo(lm[468]!.y * 480, 3)
    expect(p.cheekLeft.x).toBeCloseTo(lm[454]!.x * 640, 3)
  })
})

describe('SceneSmoother', () => {
  it('starts at the first frame, then follows slowly when still and quickly when moving', () => {
    const s = new SceneSmoother({ minAlpha: 0.2, maxAlpha: 0.9, fastPxPerFrame: 10 })
    const a = new Float32Array(36 * 3)
    s.smooth(a)
    const slow = new Float32Array(36 * 3).fill(0)
    for (let i = 0; i < slow.length; i += 3) slow[i] = 1 // 1 px: slow
    // 1 px of motion out of 10 "fast": alpha = 0.2 + 0.7 * 0.1 = 0.27.
    expect(s.smooth(slow)[0]).toBeCloseTo(0.27, 2)
    const s2 = new SceneSmoother({ minAlpha: 0.2, maxAlpha: 0.9, fastPxPerFrame: 10 })
    s2.smooth(a)
    const fast = new Float32Array(36 * 3)
    for (let i = 0; i < fast.length; i += 3) fast[i] = 20 // 20 px: fast
    expect(s2.smooth(fast)[0]).toBeCloseTo(18, 0)
  })

  it('reset forgets the history', () => {
    const s = new SceneSmoother()
    s.smooth(new Float32Array(12))
    s.reset()
    expect(s.smooth(new Float32Array(12).fill(5))[0]).toBe(5)
  })
})

describe('trianglesFromEdges', () => {
  it('finds the two triangles of a quad with a diagonal', () => {
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]].map(([start, end]) => ({ start: start!, end: end! }))
    expect([...trianglesFromEdges(edges, 4)]).toEqual([0, 1, 2, 0, 2, 3])
  })

  it('recovers a plausible face mesh from the library tessellation', () => {
    const tris = trianglesFromEdges(FaceLandmarker.FACE_LANDMARKS_TESSELATION, 468)
    const count = tris.length / 3
    // The canonical face mesh has 852 triangles. Allow a little slack for 3-cliques that are not faces.
    expect(count).toBeGreaterThanOrEqual(852)
    expect(count).toBeLessThan(900)
    expect(Math.max(...tris)).toBeLessThan(468)
  })
})
