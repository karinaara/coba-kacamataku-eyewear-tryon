// Head pose from MediaPipe's facial transformation matrix. Pure.

export interface Pose {
  /** Degrees. Sign conventions are arbitrary; only magnitudes are used for gating. */
  yaw: number
  pitch: number
  roll: number
}

const DEG = 180 / Math.PI
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * `m` is the 4x4 column-major matrix (16 numbers) from `facialTransformationMatrixes[i].data`.
 * Its rotation part may carry a uniform scale, so columns are normalized first.
 * Decomposition assumes R = Ry(yaw) * Rx(pitch) * Rz(roll).
 */
export function poseFromMatrix(m: ArrayLike<number>): Pose | null {
  if (m.length < 16) return null
  const g = (i: number) => Number(m[i])
  const sx = Math.hypot(g(0), g(1), g(2))
  const sy = Math.hypot(g(4), g(5), g(6))
  const sz = Math.hypot(g(8), g(9), g(10))
  if (!sx || !sy || !sz) return null

  const r02 = g(8) / sz
  const r22 = g(10) / sz
  const r12 = g(9) / sz
  const r10 = g(1) / sx
  const r11 = g(5) / sy

  return {
    pitch: Math.asin(clamp(-r12, -1, 1)) * DEG,
    yaw: Math.atan2(r02, r22) * DEG,
    roll: Math.atan2(r10, r11) * DEG,
  }
}
