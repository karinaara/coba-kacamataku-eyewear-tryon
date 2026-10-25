// Face measurements from landmarks (brief section 5.3). Pure.
//
// Pose handling: landmarks are put in pixel space, the in-plane tilt (roll, taken from the line
// between the irises) is rotated out, then x and y are stretched by 1/cos(yaw) and 1/cos(pitch) to
// undo foreshortening. Depth (z) is not used. This is a first-order correction that is only
// accurate for the small angles the quality gate allows.

import { MEASURE } from './config/measure'
import { FIT } from './config/tryon'
import { irisDiameterPx } from './fit'
import { LM, type Point3 } from './landmarks'
import type { Pose } from './pose'

export interface Size {
  width: number
  height: number
}

/** Landmark pairs that define each measured width/length, for drawing the measurement lines. */
export const MEASURE_LINES = [
  { id: 'faceLength', label: 'Face length', a: LM.faceTop, b: LM.chin },
  { id: 'forehead', label: 'Forehead', a: LM.foreheadRight, b: LM.foreheadLeft },
  { id: 'cheekbone', label: 'Cheekbones', a: LM.cheekRight, b: LM.cheekLeft },
  { id: 'jaw', label: 'Jaw', a: LM.jawRight, b: LM.jawLeft },
] as const

export interface Measurements {
  /** All lengths are in the same arbitrary unit (pose-corrected pixels); only ratios matter. */
  cheekWidth: number
  foreheadWidth: number
  jawWidth: number
  /** The higher jaw pair (58/288), kept for comparison with `jawWidth`. */
  jawWidthHigh: number
  /** Mesh top to chin, before the hairline factor. */
  faceLengthMesh: number
  /** Estimated hairline to chin: `faceLengthMesh * hairlineExtension`. */
  faceLength: number
  lengthToWidth: number
  foreheadToCheek: number
  jawToCheek: number
  jawToForehead: number
  /** Degrees at the chin between the two lower-jaw points (smaller = more pointed). */
  chinAngle: number
  /** Degrees of the sharpest turn along the jaw outline, averaged over both sides (higher = more angular). */
  jawAngularity: number
  /** Correction applied, for the debug view. */
  correction: { rollDeg: number; yawDeg: number; pitchDeg: number }
}

type P = { x: number; y: number }

// Face-oval order from the jaw angle down to the chin, per side (see FACE_LANDMARKS_FACE_OVAL).
const JAW_PATH_RIGHT = [172, 136, 150, 149, 176, 148, LM.chin] as const
const JAW_PATH_LEFT = [397, 365, 379, 378, 400, 377, LM.chin] as const

const DEG = 180 / Math.PI
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)

function angleAt(vertex: P, a: P, b: P): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y }
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y }
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))
  return Math.acos(Math.min(1, Math.max(-1, cos))) * DEG
}

/** Sharpest direction change (degrees) at interior points of a polyline. */
function sharpestTurn(path: readonly P[]): number {
  let best = 0
  for (let i = 1; i < path.length - 1; i++) {
    const interior = angleAt(path[i] as P, path[i - 1] as P, path[i + 1] as P)
    best = Math.max(best, 180 - interior)
  }
  return best
}

/** Landmarks in pose-corrected pixel space (indexed like the input). */
export function normalizeLandmarks(landmarks: readonly Point3[], size: Size, pose: Pose | null) {
  const px = landmarks.map((p): P => ({ x: p.x * size.width, y: p.y * size.height }))
  const eyeR = px[LM.irisRight]
  const eyeL = px[LM.irisLeft]
  // Roll: angle of the eye line. The subject's left iris is on the image's right, so dx > 0.
  const roll = eyeR && eyeL ? Math.atan2(eyeL.y - eyeR.y, eyeL.x - eyeR.x) : 0
  const c = Math.cos(-roll)
  const s = Math.sin(-roll)
  const cx = px.reduce((sum, p) => sum + p.x, 0) / px.length
  const cy = px.reduce((sum, p) => sum + p.y, 0) / px.length
  const yaw = pose?.yaw ?? 0
  const pitch = pose?.pitch ?? 0
  const sx = 1 / Math.max(0.5, Math.cos((yaw * Math.PI) / 180))
  const sy = 1 / Math.max(0.5, Math.cos((pitch * Math.PI) / 180))
  const points = px.map((p): P => {
    const dx = p.x - cx
    const dy = p.y - cy
    return { x: (dx * c - dy * s) * sx, y: (dx * s + dy * c) * sy }
  })
  return { points, correction: { rollDeg: roll * DEG, yawDeg: yaw, pitchDeg: pitch } }
}

/** Face size in millimetres, estimated with the iris as a ruler. Good to about +/-10%. */
export interface FaceScale {
  irisDiameterPx: number
  pxPerMm: number
  /** Cheekbone width (pose corrected). */
  cheekMm: number
  /** Distance between the pupils (pose corrected). */
  ipdMm: number
}

/** null when the iris is too small in the picture to use as a ruler. */
export function faceScale(landmarks: readonly Point3[], size: Size, pose: Pose | null, m: Measurements): FaceScale | null {
  const iris = irisDiameterPx(landmarks, size.width, size.height)
  if (iris < FIT.minIrisPx) return null
  const pxPerMm = iris / FIT.irisMm
  const { points } = normalizeLandmarks(landmarks, size, pose)
  const r = points[LM.irisRight]
  const l = points[LM.irisLeft]
  if (!r || !l) return null
  return { irisDiameterPx: iris, pxPerMm, cheekMm: m.cheekWidth / pxPerMm, ipdMm: dist(r, l) / pxPerMm }
}

export function measureFace(landmarks: readonly Point3[], size: Size, pose: Pose | null, cfg = MEASURE): Measurements {
  const { points, correction } = normalizeLandmarks(landmarks, size, pose)
  const at = (i: number): P => {
    const p = points[i]
    if (!p) throw new Error(`Landmark ${i} is missing`)
    return p
  }

  const cheekWidth = dist(at(LM.cheekRight), at(LM.cheekLeft))
  const foreheadWidth = dist(at(LM.foreheadRight), at(LM.foreheadLeft))
  const jawWidth = dist(at(LM.jawRight), at(LM.jawLeft))
  const jawWidthHigh = dist(at(LM.jawHighRight), at(LM.jawHighLeft))
  const faceLengthMesh = dist(at(LM.faceTop), at(LM.chin))
  const faceLength = faceLengthMesh * cfg.hairlineExtension

  const chinAngle = angleAt(at(LM.chin), at(LM.jawRight), at(LM.jawLeft))
  const jawAngularity =
    (sharpestTurn(JAW_PATH_RIGHT.map(at)) + sharpestTurn(JAW_PATH_LEFT.map(at))) / 2

  return {
    cheekWidth,
    foreheadWidth,
    jawWidth,
    jawWidthHigh,
    faceLengthMesh,
    faceLength,
    lengthToWidth: faceLength / cheekWidth,
    foreheadToCheek: foreheadWidth / cheekWidth,
    jawToCheek: jawWidth / cheekWidth,
    jawToForehead: jawWidth / foreheadWidth,
    chinAngle,
    jawAngularity,
    correction,
  }
}
