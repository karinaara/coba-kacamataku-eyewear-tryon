import { describe, expect, it } from 'vitest'
import type { Point3 } from './landmarks'
import { medianLandmarks, selectInlierFrames } from './medianLandmarks'

// Deterministic pseudo-noise so the test never flakes.
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296 - 0.5
  }
}

/** A tiny fake "face": a vertical line of points so the face height is 0.6. */
const base: Point3[] = Array.from({ length: 10 }, (_, i) => ({ x: 0.5, y: 0.2 + (0.6 * i) / 9, z: 0 }))

function noisyFrame(r: () => number, amp: number, shift = 0): Point3[] {
  return base.map((p) => ({ x: p.x + shift + r() * amp, y: p.y + r() * amp, z: r() * amp }))
}

describe('medianLandmarks', () => {
  it('takes the per-landmark median and resists a single wild frame', () => {
    const r = rng(1)
    const frames = [...Array.from({ length: 9 }, () => noisyFrame(r, 0.002)), noisyFrame(r, 0.002, 0.2)]
    const med = medianLandmarks(frames)
    med.forEach((p, i) => {
      expect(Math.abs(p.x - (base[i] as Point3).x)).toBeLessThan(0.003)
      expect(Math.abs(p.y - (base[i] as Point3).y)).toBeLessThan(0.003)
    })
  })

  it('throws on no frames', () => {
    expect(() => medianLandmarks([])).toThrow()
  })
})

describe('selectInlierFrames', () => {
  it('rejects shifted frames and keeps the steady ones', () => {
    const r = rng(7)
    const steady = Array.from({ length: 18 }, () => noisyFrame(r, 0.001))
    const frames = [...steady, noisyFrame(r, 0.001, 0.05), noisyFrame(r, 0.001, -0.04)]
    const kept = selectInlierFrames(frames)
    expect(kept).toHaveLength(18)
    expect(kept.every((i) => i < 18)).toBe(true)
  })

  it('keeps everything when frames agree', () => {
    const r = rng(3)
    const frames = Array.from({ length: 12 }, () => noisyFrame(r, 0.001))
    expect(selectInlierFrames(frames).length).toBeGreaterThanOrEqual(11)
  })
})
