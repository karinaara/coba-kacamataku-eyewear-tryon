import { describe, expect, it } from 'vitest'
import { EVAL } from '../core/config/eval'
import { FACE_SHAPES, type FaceShape } from '../core/config/faceShapes'
import { classifyFaceShape } from '../core/faceShape'
import { measureFace } from '../core/measure'
import { MEASURE } from '../core/config/measure'
import { FIXTURES } from '../core/fixtures'
import { candidates, CURRENT, Evaluator, tune, type TuneItem } from './tune'
import { sweep } from './testing'

const base = FIXTURES[0]!
const itemsFor = (n: number, labelWith: (m: ReturnType<typeof measureFace>) => FaceShape): TuneItem[] =>
  sweep(n, 0.7, 1.45).map((f) => ({
    landmarks: f.landmarks,
    size: f.size,
    pose: f.pose,
    label: labelWith(measureFace(f.landmarks, f.size, f.pose)),
  }))

const labelWithHairline = (h: number) => (m: ReturnType<typeof measureFace>) => {
  // Re-derive the measurements at another hairline factor, then classify with the current model.
  const lengthToWidth = (m.faceLengthMesh * h) / m.cheekWidth
  return classifyFaceShape({ ...m, lengthToWidth }).primary
}

describe('the tuner', () => {
  it('current config scores perfectly on labels the current model produced (the evaluator agrees with the classifier)', () => {
    const items = itemsFor(30, labelWithHairline(MEASURE.hairlineExtension))
    const s = new Evaluator(items).score(CURRENT, items.map((_, i) => i))
    expect(s.top1).toBe(1)
  })

  it('refuses to advise on a tiny labeled set, and says why', () => {
    const r = tune(itemsFor(12, labelWithHairline(1.3)))
    expect(r.recommend).toBe(false)
    expect(r.reason).toMatch(new RegExp(`needs at least ${EVAL.minTuneItems}`))
  })

  it('also refuses between the tuner minimum and the evaluation minimum (any change would be a guess)', () => {
    const r = tune(itemsFor(25, labelWithHairline(1.3)))
    expect(r.recommend).toBe(false)
    expect(r.reason).toMatch(/guess/)
  })

  it('finds a better setting when the labels really came from one, and measures the gain on held-out faces', () => {
    const items = itemsFor(60, labelWithHairline(1.3))
    const r = tune(items)
    expect(r.heldOutCurrent.top1).toBeLessThan(1)
    expect(r.heldOutTuned.top1).toBeGreaterThan(r.heldOutCurrent.top1)
    expect(r.heldOutGain).toBeGreaterThanOrEqual(EVAL.minTuningGain)
    expect(r.best.hairlineExtension).toBeGreaterThan(MEASURE.hairlineExtension)
    expect(r.recommend).toBe(true)
    expect(r.folds).toBe(EVAL.folds)
  })

  it('advises nothing when the current config already fits (no held-out gain)', () => {
    const r = tune(itemsFor(60, labelWithHairline(MEASURE.hairlineExtension)))
    expect(r.heldOutGain).toBeLessThan(EVAL.minTuningGain)
    expect(r.recommend).toBe(false)
    expect(r.reason).toMatch(/Keep the current config/)
  })

  it('does not reward fitting noise: random labels give no honest held-out gain', () => {
    // Labels unrelated to the faces. The best setting on ALL the data will look better than it is,
    // but the held-out comparison must not show a real gain.
    let s = 7
    const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
    const items = itemsFor(60, () => FACE_SHAPES[Math.floor(rand() * FACE_SHAPES.length)] as FaceShape)
    const r = tune(items)
    expect(r.bestTrainScore.top1).toBeGreaterThan(r.heldOutTuned.top1 - 0.001)
    expect(r.heldOutGain).toBeLessThan(EVAL.minTuningGain)
    expect(r.recommend).toBe(false)
  })

  it('is reproducible', () => {
    const items = itemsFor(40, labelWithHairline(1.25))
    expect(tune(items)).toEqual(tune(items))
  })

  it('the grid includes the current config, so tuning can never be worse on the data it was fitted on', () => {
    const items = itemsFor(40, labelWithHairline(1.25))
    const all = items.map((_, i) => i)
    const ev = new Evaluator(items)
    const best = tune(items).bestTrainScore
    expect(best.logLoss).toBeLessThanOrEqual(ev.score(CURRENT, all).logLoss + 1e-9)
    expect(candidates().some((c) => c.hairlineExtension === CURRENT.hairlineExtension && c.sigmaScale === 1 && c.softmaxTemperature === CURRENT.softmaxTemperature && c.chinWeight === CURRENT.chinWeight)).toBe(true)
    void base
  })
})
