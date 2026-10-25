import { describe, expect, it } from 'vitest'
import { labToRgb, luma, mean, median, rgbToLab } from './color'

describe('rgbToLab', () => {
  it('maps white and black', () => {
    const w = rgbToLab(255, 255, 255)
    expect(w[0]).toBeCloseTo(100, 1)
    expect(w[1]).toBeCloseTo(0, 1)
    expect(w[2]).toBeCloseTo(0, 1)
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 5)
  })

  it('matches reference values (sRGB red, mid gray)', () => {
    const red = rgbToLab(255, 0, 0)
    expect(red[0]).toBeCloseTo(53.24, 0)
    expect(red[1]).toBeCloseTo(80.09, 0)
    expect(red[2]).toBeCloseTo(67.2, 0)
    expect(rgbToLab(128, 128, 128)[0]).toBeCloseTo(53.59, 0)
  })
})

describe('labToRgb', () => {
  it('round-trips sRGB through Lab', () => {
    const samples: [number, number, number][] = [[198, 150, 120], [255, 255, 255], [0, 0, 0], [60, 40, 30], [240, 200, 180], [128, 128, 128]]
    for (const [r, g, b] of samples) {
      const [L, a, bb] = rgbToLab(r, g, b)
      const out = labToRgb(L, a, bb)
      expect(Math.abs(out[0] - r)).toBeLessThanOrEqual(1)
      expect(Math.abs(out[1] - g)).toBeLessThanOrEqual(1)
      expect(Math.abs(out[2] - b)).toBeLessThanOrEqual(1)
    }
  })
  it('clamps out-of-gamut colors instead of returning NaN', () => {
    const out = labToRgb(50, 120, 120)
    expect(out.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true)
  })
})

describe('helpers', () => {
  it('median handles odd, even and empty input', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNaN()
  })
  it('mean and luma', () => {
    expect(mean([1, 2, 3])).toBe(2)
    expect(luma(255, 255, 255)).toBeCloseTo(255, 3)
  })
})
