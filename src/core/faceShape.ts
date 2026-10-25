// Soft face-shape classifier: prototype distance -> softmax (brief section 5.4). Pure.
// No if/else cascade: every shape gets a probability.

import {
  CHIN_CATEGORIES,
  CHIN_MODEL,
  FACE_SHAPES,
  FACE_SHAPE_MODEL,
  PROTOTYPES,
  type ChinCategory,
  type FaceShape,
  type NumericFeature,
} from './config/faceShapes'
import type { Measurements } from './measure'

export type ShapeInput = Pick<Measurements, NumericFeature | 'chinAngle' | 'jawAngularity'>

export interface FaceShapeResult {
  primary: FaceShape
  secondary: FaceShape
  probabilities: Record<FaceShape, number>
  /** True when the top probability is below the "between" threshold: show as "between X and Y". */
  between: boolean
  /** Chin category memberships (0..1) derived from the numbers. */
  chin: Record<ChinCategory, number>
  /** Per shape, per feature: signed distance from the prototype in sigma units. */
  deviations: Record<FaceShape, Record<NumericFeature | 'chin', number>>
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** 0 at `zero`, 1 at `full`, linear between (works for either direction). */
const ramp = (v: number, zero: number, full: number) => clamp01((v - zero) / (full - zero))

export function chinMemberships(chinAngle: number, jawAngularity: number): Record<ChinCategory, number> {
  const pointed = ramp(chinAngle, CHIN_MODEL.pointed.chinAngle.zero, CHIN_MODEL.pointed.chinAngle.full)
  const angular = ramp(jawAngularity, CHIN_MODEL.angular.jawAngularity.zero, CHIN_MODEL.angular.jawAngularity.full)
  const soft = (1 - pointed) * (1 - angular)
  const mixed = clamp01((1 - Math.max(pointed, angular, soft)) * CHIN_MODEL.mixedBoost)
  return { soft, angular, pointed, mixed }
}

const NUMERIC: NumericFeature[] = ['lengthToWidth', 'foreheadToCheek', 'jawToCheek']

export function classifyFaceShape(m: ShapeInput, model = FACE_SHAPE_MODEL): FaceShapeResult {
  const chin = chinMemberships(m.chinAngle, m.jawAngularity)
  const deviations = {} as FaceShapeResult['deviations']
  const scores = {} as Record<FaceShape, number>

  for (const shape of FACE_SHAPES) {
    const proto = PROTOTYPES[shape]
    const dev = {} as Record<NumericFeature | 'chin', number>
    let penalty = 0
    for (const f of NUMERIC) {
      const z = (m[f] - proto[f]) / model.sigma[f]
      dev[f] = z
      penalty += model.weight[f] * z * z
    }
    const zChin = (1 - chin[proto.chin]) / model.chinSigma
    dev.chin = zChin
    penalty += model.weight.chin * zChin * zChin
    deviations[shape] = dev
    scores[shape] = -penalty
  }

  // Softmax with the max subtracted for numerical stability.
  const top = Math.max(...FACE_SHAPES.map((s) => scores[s]))
  const exps = FACE_SHAPES.map((s) => Math.exp((scores[s] - top) / model.temperature))
  const sum = exps.reduce((a, b) => a + b, 0)
  const probabilities = Object.fromEntries(FACE_SHAPES.map((s, i) => [s, (exps[i] as number) / sum])) as Record<FaceShape, number>

  const ranked = [...FACE_SHAPES].sort((a, b) => probabilities[b] - probabilities[a])
  const primary = ranked[0] as FaceShape
  const secondary = ranked[1] as FaceShape
  return {
    primary,
    secondary,
    probabilities,
    between: probabilities[primary] < model.betweenThreshold,
    chin,
    deviations,
  }
}

export const bestChinCategory = (chin: Record<ChinCategory, number>): ChinCategory =>
  [...CHIN_CATEGORIES].sort((a, b) => chin[b] - chin[a])[0] as ChinCategory
