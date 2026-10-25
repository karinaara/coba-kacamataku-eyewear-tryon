import { describe, expect, it } from 'vitest'
import { SMOOTHING } from './config/tryon'
import { OneEuro1D, PointSmoother } from './smoothing'

// Deterministic noise in [-0.5, 0.5).
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296 - 0.5
  }
}
const std = (v: number[]) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)
}
const FPS = 30
const dt = 1 / FPS

describe('OneEuro1D', () => {
  it('passes the first value through and holds a constant', () => {
    const f = new OneEuro1D(SMOOTHING.position)
    expect(f.filter(42, 0)).toBe(42)
    for (let i = 1; i < 50; i++) expect(f.filter(42, i * dt)).toBeCloseTo(42, 9)
  })

  it('cuts jitter on a still signal by more than 3x', () => {
    const r = rng(5)
    const f = new OneEuro1D(SMOOTHING.position)
    const raw: number[] = []
    const out: number[] = []
    for (let i = 0; i < 300; i++) {
      const v = 500 + r() * 6 // +/- 3 px of detector noise
      raw.push(v)
      out.push(f.filter(v, i * dt))
    }
    expect(std(out.slice(30))).toBeLessThan(std(raw.slice(30)) / 3)
  })

  it('follows a fast move: a 200 px step is mostly closed within 0.5 s', () => {
    const f = new OneEuro1D(SMOOTHING.position)
    for (let i = 0; i < 30; i++) f.filter(100, i * dt)
    let v = 0
    for (let i = 0; i < 15; i++) v = f.filter(300, (30 + i) * dt)
    expect(v).toBeGreaterThan(300 - 200 * 0.1)
  })

  it('lags less than a plain low-pass at the same resting smoothness (that is the point of beta)', () => {
    const slow = { ...SMOOTHING.position, beta: 0 }
    const a = new OneEuro1D(SMOOTHING.position)
    const b = new OneEuro1D(slow)
    let ea = 0
    let eb = 0
    for (let i = 0; i < 90; i++) {
      const truth = i * 8 // 240 px/s ramp
      ea += Math.abs(a.filter(truth, i * dt) - truth)
      eb += Math.abs(b.filter(truth, i * dt) - truth)
    }
    expect(ea).toBeLessThan(eb / 2)
  })

  it('reset forgets the past', () => {
    const f = new OneEuro1D(SMOOTHING.position)
    f.filter(0, 0)
    f.filter(0, dt)
    f.reset()
    expect(f.filter(900, 5)).toBe(900)
  })

  it('survives repeated or backwards timestamps', () => {
    const f = new OneEuro1D(SMOOTHING.position)
    f.filter(1, 1)
    expect(Number.isFinite(f.filter(2, 1))).toBe(true)
    expect(Number.isFinite(f.filter(3, 0.5))).toBe(true)
  })
})

describe('PointSmoother', () => {
  it('keeps points independent and resets together', () => {
    const s = new PointSmoother<'a' | 'b'>(SMOOTHING.position)
    expect(s.smooth('a', { x: 1, y: 2 }, 0)).toEqual({ x: 1, y: 2 })
    expect(s.smooth('b', { x: 100, y: 200 }, 0)).toEqual({ x: 100, y: 200 })
    s.reset()
    expect(s.smooth('a', { x: 7, y: 8 }, 3)).toEqual({ x: 7, y: 8 })
  })
})
