import { describe, expect, it } from 'vitest'
import { convexHull, pointInConvex, samplePixels, shrinkHull, type Vec2 } from './roi'

describe('convexHull', () => {
  it('drops interior points and is order independent', () => {
    const pts: Vec2[] = [[0, 0], [4, 0], [4, 4], [0, 4], [2, 2], [1, 3]]
    const a = convexHull(pts)
    const b = convexHull([...pts].reverse())
    expect(a).toHaveLength(4)
    expect(new Set(a.map(String))).toEqual(new Set(b.map(String)))
  })
})

describe('shrinkHull', () => {
  it('scales about the center and keeps the shape', () => {
    const out = shrinkHull([[0, 0], [10, 0], [10, 10], [0, 10]], 0.5)
    expect(out).toEqual([[2.5, 2.5], [7.5, 2.5], [7.5, 7.5], [2.5, 7.5]])
    expect(shrinkHull([], 0.5)).toEqual([])
  })
})

describe('pointInConvex', () => {
  const square = convexHull([[0, 0], [10, 0], [10, 10], [0, 10]])
  it('classifies inside and outside', () => {
    expect(pointInConvex(square, 5, 5)).toBe(true)
    expect(pointInConvex(square, 11, 5)).toBe(false)
    expect(pointInConvex(square, 5, -1)).toBe(false)
  })
})

describe('samplePixels', () => {
  it('returns only pixels inside the hull and clips to the image', () => {
    const w = 10
    const h = 10
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) data.set([i % 256, 0, 0, 255], i * 4)
    const px = samplePixels({ data, width: w, height: h }, [[2, 2], [6, 2], [6, 6], [2, 6]])
    expect(px).toHaveLength(16)
    const clipped = samplePixels({ data, width: w, height: h }, [[-5, -5], [5, -5], [5, 5], [-5, 5]])
    expect(clipped).toHaveLength(25)
  })
})
