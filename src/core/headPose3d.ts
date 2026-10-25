// Head pose for the 3D try-on, straight from the face landmarks (no matrix conventions to get wrong). Pure.
//
// Scene space (right-handed, like the picture, but with y up and z toward the viewer):
//   X = landmark.x * width, Y = height - landmark.y * height, Z = -landmark.z * width.
// MediaPipe's z uses roughly the same scale as x and is smaller for points closer to the camera, hence the minus.

import { TRYON3D } from './config/tryon3d'
import type { FitPoints } from './fit'
import { IRIS_RING_LEFT, IRIS_RING_RIGHT, LM } from './landmarks'
import type { Vec2 } from './smoothing'

export type Vec3 = readonly [number, number, number]

/** Converts a landmark list to a flat [x, y, z, x, y, z, ...] array in scene space. */
export function toScene(landmarks: ReadonlyArray<{ x: number; y: number; z: number }>, width: number, height: number, out?: Float32Array): Float32Array {
  const a = out && out.length === landmarks.length * 3 ? out : new Float32Array(landmarks.length * 3)
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i] as { x: number; y: number; z: number }
    a[i * 3] = p.x * width
    a[i * 3 + 1] = height - p.y * height
    a[i * 3 + 2] = -p.z * width
  }
  return a
}

export const pointAt = (a: ArrayLike<number>, i: number): Vec3 => [a[i * 3] as number, a[i * 3 + 1] as number, a[i * 3 + 2] as number]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export function normalize(a: Vec3): Vec3 {
  const l = length(a)
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0]
}

export interface HeadBasis {
  /** Unit axes in scene space: sideways (subject's right to left = image left to right when facing the camera), up, forward (out of the face). */
  x: Vec3
  y: Vec3
  z: Vec3
}

/** Orthonormal head axes from the landmarks. Returns null if the points are degenerate. */
export function headBasis(points: ArrayLike<number>, cfg = TRYON3D.pose): HeadBasis | null {
  let side: Vec3 = [0, 0, 0]
  for (const [from, to] of cfg.sidewaysPairs) side = add(side, sub(pointAt(points, to), pointAt(points, from)))
  const x = normalize(side)
  const upRaw = sub(pointAt(points, cfg.upTo), pointAt(points, cfg.upFrom))
  // Remove the sideways part of "up" so the axes are perpendicular, then build forward from the two.
  const y = normalize(sub(upRaw, scale(x, dot(upRaw, x))))
  const z = normalize(cross(x, y))
  if (length(x) === 0 || length(y) === 0 || length(z) === 0) return null
  return { x, y, z }
}

/** The 2D fit landmarks (picture pixels, y down) read back out of scene-space points. */
export function fitPointsFromScene(points: ArrayLike<number>, height: number): FitPoints {
  const at = (i: number): Vec2 => ({ x: points[i * 3] as number, y: height - (points[i * 3 + 1] as number) })
  const d = (a: number, b: number) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y)
  const eye = (r: readonly [number, number, number, number]) => Math.max(d(r[0], r[2]), d(r[1], r[3]))
  return {
    irisDiameterPx: (eye(IRIS_RING_RIGHT) + eye(IRIS_RING_LEFT)) / 2,
    irisRight: at(LM.irisRight),
    irisLeft: at(LM.irisLeft),
    cheekRight: at(LM.cheekRight),
    cheekLeft: at(LM.cheekLeft),
    bridge: at(LM.noseBridge),
    noseTip: at(LM.noseTip),
  }
}

/** Yaw, pitch and roll of a basis in degrees (for display and tests). Yaw is about the vertical axis. */
export function eulerDegrees(b: HeadBasis): { yaw: number; pitch: number; roll: number } {
  const DEG = 180 / Math.PI
  return {
    yaw: Math.atan2(b.z[0], b.z[2]) * DEG,
    pitch: Math.asin(Math.max(-1, Math.min(1, b.z[1]))) * DEG,
    roll: Math.atan2(b.x[1], b.x[0]) * DEG,
  }
}

/**
 * Smooths every landmark with an exponential filter whose weight rises when the face moves fast.
 * (Cheaper than a One Euro filter on 478 x 3 values, and good enough for the occluder and the head axes.)
 */
export class SceneSmoother {
  private state: Float32Array | null = null
  private readonly cfg: typeof TRYON3D.smoothing

  constructor(cfg = TRYON3D.smoothing) {
    this.cfg = cfg
  }

  reset() {
    this.state = null
  }

  smooth(raw: Float32Array): Float32Array {
    if (!this.state || this.state.length !== raw.length) {
      this.state = Float32Array.from(raw)
      return this.state
    }
    const s = this.state
    // Average motion of a spread of points, in pixels since the last frame.
    let moved = 0
    let n = 0
    for (let i = 0; i < raw.length; i += 3 * 12) {
      moved += Math.hypot((raw[i] as number) - (s[i] as number), (raw[i + 1] as number) - (s[i + 1] as number))
      n++
    }
    const speed = n ? moved / n : 0
    const t = Math.min(1, speed / this.cfg.fastPxPerFrame)
    const alpha = this.cfg.minAlpha + (this.cfg.maxAlpha - this.cfg.minAlpha) * t
    for (let i = 0; i < raw.length; i++) s[i] = (s[i] as number) + ((raw[i] as number) - (s[i] as number)) * alpha
    return s
  }
}

/** Triangles (3 indices each) recovered from a triangulated mesh's edge list: every triple whose three edges all exist. */
export function trianglesFromEdges(edges: ReadonlyArray<{ start: number; end: number }>, vertexCount: number): Uint16Array {
  const adj: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>())
  for (const { start, end } of edges) {
    adj[start]?.add(end)
    adj[end]?.add(start)
  }
  const tris: number[] = []
  for (let a = 0; a < vertexCount; a++) {
    for (const b of adj[a] as Set<number>) {
      if (b <= a) continue
      for (const c of adj[b] as Set<number>) {
        if (c <= b) continue
        if ((adj[a] as Set<number>).has(c)) tris.push(a, b, c)
      }
    }
  }
  return Uint16Array.from(tris)
}
