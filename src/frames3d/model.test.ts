import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { FRAME_COLORS } from '../core/config/colors'
import { FRAME_STYLES, LENS_TINTS } from '../core/config/frames'
import { dedupe, ensureCcw, lensOutlines, offsetPolygon, sampleRoundedPolygon, signedArea } from '../frames/outline'
import { buildFrameModel } from './model'

describe('outline helpers', () => {
  const square = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }]

  it('offsetting a square by d grows each side by d', () => {
    const out = offsetPolygon(ensureCcw(square), 0.5, 2)
    const xs = out.map((p) => p.x)
    expect(Math.max(...xs)).toBeCloseTo(1.5, 5)
    expect(Math.min(...xs)).toBeCloseTo(-1.5, 5)
  })

  it('a negative offset shrinks it', () => {
    const area = signedArea(offsetPolygon(ensureCcw(square), -0.5, 2))
    expect(area).toBeCloseTo(1, 5)
  })

  it('sharp corners (radius 0) keep their exact points and rounded ones add samples', () => {
    expect(sampleRoundedPolygon(square, [0, 0, 0, 0], 8)).toHaveLength(4)
    expect(sampleRoundedPolygon(square, [1, 1, 1, 1], 8).length).toBeGreaterThan(30)
  })

  it('dedupe drops repeats, including the wrap-around', () => {
    expect(dedupe([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }])).toHaveLength(2)
  })

  it('lens outlines are counter-clockwise mirror images, left of the bridge', () => {
    for (const s of FRAME_STYLES) {
      const { left, right } = lensOutlines(s, 10)
      expect(signedArea(left)).toBeGreaterThan(0)
      expect(signedArea(right)).toBeGreaterThan(0)
      expect(Math.max(...left.map((p) => p.x))).toBeLessThan(0)
      expect(Math.min(...right.map((p) => p.x))).toBeGreaterThan(0)
      expect(Math.abs(signedArea(left) - signedArea(right))).toBeLessThan(1e-6)
    }
  })

  it('a round lens outline is about as wide as it is tall', () => {
    const { left } = lensOutlines(FRAME_STYLES.find((s) => s.id === 'round')!, 10)
    const w = Math.max(...left.map((p) => p.x)) - Math.min(...left.map((p) => p.x))
    const h = Math.max(...left.map((p) => p.y)) - Math.min(...left.map((p) => p.y))
    expect(w).toBeCloseTo(46, 0)
    expect(h).toBeCloseTo(46, 0)
  })
})

describe('buildFrameModel', () => {
  it('builds every style in every material without NaN and at about the real width', () => {
    const materials = new Map(FRAME_COLORS.map((c) => [c.material, c]))
    expect(materials.size).toBe(5)
    for (const style of FRAME_STYLES) {
      for (const color of materials.values()) {
        const model = buildFrameModel(style, color, 'clear')
        const box = new THREE.Box3().setFromObject(model.group)
        expect(box.isEmpty(), `${style.id}/${color.id}`).toBe(false)
        for (const v of [box.min, box.max]) expect([v.x, v.y, v.z].every(Number.isFinite), `${style.id}/${color.id}`).toBe(true)
        // The widest part is the front (or the aviator's top bar), so the box must cover the front and not be wildly wider.
        const width = box.max.x - box.min.x
        expect(width, style.id).toBeGreaterThanOrEqual(model.frontMm * 0.95)
        expect(width, style.id).toBeLessThanOrEqual(model.frontMm * 1.15)
        // Temples run back (-z) about 15 cm from the front, and nothing pokes far forward.
        expect(box.min.z, style.id).toBeLessThan(-120)
        expect(box.max.z, style.id).toBeLessThan(15)
        model.dispose()
      }
    }
  })

  it('has lenses for every tint and a mesh per lens', () => {
    const style = FRAME_STYLES[0]!
    for (const tint of LENS_TINTS) {
      const model = buildFrameModel(style, FRAME_COLORS[0]!, tint.id)
      const transparent = model.group.children.filter((o) => o instanceof THREE.Mesh && (o.material as THREE.Material).transparent)
      expect(transparent.length).toBe(2)
      model.dispose()
    }
  })

  it('is symmetric left to right', () => {
    for (const style of FRAME_STYLES) {
      const box = new THREE.Box3().setFromObject(buildFrameModel(style, FRAME_COLORS[0]!, 'clear').group)
      expect(box.min.x + box.max.x, style.id).toBeCloseTo(0, 0)
    }
  })
})
