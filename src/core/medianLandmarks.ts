// Multi-frame noise reduction (brief section 5.2). Pure.

import { CAPTURE } from './config/capture'
import { median } from './color'
import { lmAt, type Point3 } from './landmarks'
import { faceBox } from './quality'

type Frame = readonly Point3[]

/** Per-landmark median over frames (x, y and z independently). */
export function medianLandmarks(frames: readonly Frame[]): Point3[] {
  const first = frames[0]
  if (!first) throw new Error('medianLandmarks needs at least one frame')
  return first.map((_, i) => ({
    x: median(frames.map((f) => lmAt(f, i).x)),
    y: median(frames.map((f) => lmAt(f, i).y)),
    z: median(frames.map((f) => lmAt(f, i).z)),
  }))
}

/** Mean landmark displacement from a reference frame, as a fraction of the reference face height. */
export function frameDeviation(frame: Frame, ref: Frame): number {
  const h = faceBox(ref).h || 1
  let sum = 0
  for (let i = 0; i < ref.length; i++) {
    const a = lmAt(frame, i)
    const b = lmAt(ref, i)
    sum += Math.hypot(a.x - b.x, a.y - b.y)
  }
  return sum / ref.length / h
}

/**
 * Drops frames that sit far from the crowd (a blink, a head turn, a detection glitch).
 * Returns the indices of the frames to keep.
 */
export function selectInlierFrames(frames: readonly Frame[], cfg = CAPTURE.outlier): number[] {
  if (frames.length < 3) return frames.map((_, i) => i)
  const provisional = medianLandmarks(frames)
  const dev = frames.map((f) => frameDeviation(f, provisional))
  const med = median(dev)
  const mad = median(dev.map((d) => Math.abs(d - med)))
  const limit = Math.max(cfg.minThreshold, med + cfg.madK * mad)
  return dev.flatMap((d, i) => (d <= limit ? [i] : []))
}
