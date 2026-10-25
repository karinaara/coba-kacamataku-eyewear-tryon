// Tuning helper for the face-shape classifier (brief section 9: "tune config values using the labeled set").
// It never edits config. It reports what it WOULD change and, crucially, how much that helps on faces it
// was not fitted on (cross-validation), so a setting is only suggested if it genuinely generalizes.

import { EVAL } from '../core/config/eval'
import { FACE_SHAPE_MODEL, type FaceShape } from '../core/config/faceShapes'
import { classifyFaceShape } from '../core/faceShape'
import { MEASURE } from '../core/config/measure'
import { measureFace, type Measurements, type Size } from '../core/measure'
import type { Point3 } from '../core/landmarks'
import type { Pose } from '../core/pose'
import { logLoss, seeded, topKAccuracy } from './metrics'

export interface TuneItem {
  landmarks: Point3[]
  size: Size
  pose: Pose | null
  /** The labelers' majority shape. */
  label: FaceShape
}

export interface Candidate {
  /** Mesh top to hairline correction on face length. */
  hairlineExtension: number
  softmaxTemperature: number
  /** Multiplies every feature sigma: bigger = more forgiving of distance from a prototype. */
  sigmaScale: number
  chinWeight: number
}

export const CURRENT: Candidate = {
  hairlineExtension: MEASURE.hairlineExtension,
  softmaxTemperature: FACE_SHAPE_MODEL.temperature,
  sigmaScale: 1,
  chinWeight: FACE_SHAPE_MODEL.weight.chin,
}

export const DEFAULT_GRID = {
  hairlineExtension: [1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3],
  softmaxTemperature: [0.75, 1.0, 1.5, 2.0, 3.0],
  sigmaScale: [0.75, 1.0, 1.25, 1.5],
  chinWeight: [0, 0.3, 0.6, 1.0],
}

export function candidates(grid: Record<keyof Candidate, readonly number[]> = DEFAULT_GRID): Candidate[] {
  const out: Candidate[] = []
  for (const hairlineExtension of grid.hairlineExtension)
    for (const softmaxTemperature of grid.softmaxTemperature)
      for (const sigmaScale of grid.sigmaScale) for (const chinWeight of grid.chinWeight) out.push({ hairlineExtension, softmaxTemperature, sigmaScale, chinWeight })
  return out
}

export interface Score {
  top1: number
  top2: number
  logLoss: number
}

/** Measurements depend only on the hairline factor, so they are computed once per factor and reused. */
export class Evaluator {
  private cache = new Map<number, Measurements[]>()
  private items: readonly TuneItem[]

  constructor(items: readonly TuneItem[]) {
    this.items = items
  }

  private measured(h: number): Measurements[] {
    let m = this.cache.get(h)
    if (!m) {
      m = this.items.map((it) => measureFace(it.landmarks, it.size, it.pose, { ...MEASURE, hairlineExtension: h }))
      this.cache.set(h, m)
    }
    return m
  }

  score(c: Candidate, indices: readonly number[]): Score {
    const ms = this.measured(c.hairlineExtension)
    const model = {
      ...FACE_SHAPE_MODEL,
      temperature: c.softmaxTemperature,
      sigma: {
        lengthToWidth: FACE_SHAPE_MODEL.sigma.lengthToWidth * c.sigmaScale,
        foreheadToCheek: FACE_SHAPE_MODEL.sigma.foreheadToCheek * c.sigmaScale,
        jawToCheek: FACE_SHAPE_MODEL.sigma.jawToCheek * c.sigmaScale,
      },
      weight: { ...FACE_SHAPE_MODEL.weight, chin: c.chinWeight },
    }
    const truth = indices.map((i) => (this.items[i] as TuneItem).label as string)
    const probs = indices.map((i) => classifyFaceShape(ms[i] as Measurements, model).probabilities as Record<string, number>)
    return { top1: topKAccuracy(truth, probs, 1), top2: topKAccuracy(truth, probs, 2), logLoss: logLoss(truth, probs) }
  }
}

/** Better = lower log loss (it uses the whole distribution, so it is less jumpy than accuracy on small sets). */
const better = (a: Score, b: Score) => a.logLoss < b.logLoss - 1e-12 || (Math.abs(a.logLoss - b.logLoss) <= 1e-12 && a.top1 > b.top1)

export interface TuneResult {
  n: number
  folds: number
  /** The best setting over ALL the data. Its own score is optimistic, since it was picked on that same data. */
  best: Candidate
  bestTrainScore: Score
  /** Honest estimates: on each held-out fold, using the setting chosen from the other folds. */
  heldOutTuned: Score
  /** The current config on the same held-out folds, for a fair comparison. */
  heldOutCurrent: Score
  /** Held-out top-1 gain of tuning over the current config. */
  heldOutGain: number
  /** True only if there was enough data and the held-out gain clears the threshold. */
  recommend: boolean
  reason: string
}

function folds(n: number, k: number, seed: number): number[][] {
  const rand = seeded(seed)
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j] as number, order[i] as number]
  }
  return Array.from({ length: k }, (_, f) => order.filter((_, idx) => idx % k === f))
}

export function tune(items: readonly TuneItem[], grid = candidates(), k = EVAL.folds, seed = EVAL.seed): TuneResult {
  const ev = new Evaluator(items)
  const all = Array.from({ length: items.length }, (_, i) => i)
  const pickBest = (idx: readonly number[]) => {
    let best = grid[0] as Candidate
    let bestScore = ev.score(best, idx)
    for (const c of grid.slice(1)) {
      const s = ev.score(c, idx)
      if (better(s, bestScore)) {
        best = c
        bestScore = s
      }
    }
    return { best, score: bestScore }
  }

  const overall = pickBest(all)
  const parts = folds(items.length, Math.min(k, items.length), seed)
  const tuned: Score[] = []
  const current: Score[] = []
  const weights: number[] = []
  for (let f = 0; f < parts.length; f++) {
    const test = parts[f] as number[]
    const train = parts.flatMap((p, i) => (i === f ? [] : p))
    if (test.length === 0 || train.length === 0) continue
    tuned.push(ev.score(pickBest(train).best, test))
    current.push(ev.score(CURRENT, test))
    weights.push(test.length)
  }
  const wmean = (xs: number[]) => xs.reduce((a, x, i) => a + x * (weights[i] as number), 0) / weights.reduce((a, b) => a + b, 0)
  const agg = (xs: Score[]): Score => ({ top1: wmean(xs.map((s) => s.top1)), top2: wmean(xs.map((s) => s.top2)), logLoss: wmean(xs.map((s) => s.logLoss)) })
  const heldOutTuned = agg(tuned)
  const heldOutCurrent = agg(current)
  const gain = heldOutTuned.top1 - heldOutCurrent.top1

  let reason: string
  let rec = false
  if (items.length < EVAL.minTuneItems) reason = `Only ${items.length} labeled faces; the tuner needs at least ${EVAL.minTuneItems} and is not advising a change.`
  else if (items.length < EVAL.minShapeItems) reason = `Only ${items.length} labeled faces (the evaluation asks for ${EVAL.minShapeItems}+). Any change would be a guess, so none is advised.`
  else if (gain < EVAL.minTuningGain) reason = `On faces held out of the fit, tuning gained ${(gain * 100).toFixed(1)} points of top-1 accuracy, under the ${(EVAL.minTuningGain * 100).toFixed(0)}-point bar. Keep the current config.`
  else {
    rec = true
    reason = `On faces held out of the fit, tuning gained ${(gain * 100).toFixed(1)} points of top-1 accuracy (${(heldOutCurrent.top1 * 100).toFixed(1)}% to ${(heldOutTuned.top1 * 100).toFixed(1)}%). Review the suggestion, then apply it by hand.`
  }
  return { n: items.length, folds: tuned.length, best: overall.best, bestTrainScore: overall.score, heldOutTuned, heldOutCurrent, heldOutGain: gain, recommend: rec, reason }
}
