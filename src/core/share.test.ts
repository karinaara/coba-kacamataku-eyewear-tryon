import { describe, expect, it } from 'vitest'
import { FACE_SHAPES, PROTOTYPES, type FaceShape } from './config/faceShapes'
import { NICKNAME, SHARE } from './config/share'
import { classifyFaceShape, type FaceShapeResult } from './faceShape'
import { nicknameFor, photoCrop, shapeLine, shareAltText, shareLayout } from './share'

const CHIN = { soft: { chinAngle: 125, jawAngularity: 10 }, angular: { chinAngle: 125, jawAngularity: 55 }, pointed: { chinAngle: 85, jawAngularity: 10 }, mixed: { chinAngle: 102.5, jawAngularity: 35 } }
const faceOf = (s: FaceShape): FaceShapeResult => {
  const p = PROTOTYPES[s]
  return classifyFaceShape({ lengthToWidth: p.lengthToWidth, foreheadToCheek: p.foreheadToCheek, jawToCheek: p.jawToCheek, ...CHIN[p.chin] })
}
const between = classifyFaceShape({ lengthToWidth: 1.3, foreheadToCheek: 0.865, jawToCheek: 0.785, ...CHIN.soft })

describe('nicknames', () => {
  it('has a distinct, non-empty nickname for each of the six shapes', () => {
    expect(new Set(Object.values(NICKNAME)).size).toBe(6)
    for (const s of FACE_SHAPES) expect(NICKNAME[s].startsWith('The ')).toBe(true)
  })

  it('uses the shape\'s nickname for a clear face, and names both shapes for a face between two', () => {
    expect(nicknameFor(faceOf('oval'))).toBe('The Classic Oval')
    expect(nicknameFor(faceOf('round'))).toBe('The Friendly Round')
    if (between.between) {
      const n = nicknameFor(between)
      expect(n).toMatch(/Blend$/)
      expect(n.toLowerCase()).toContain(between.primary)
      expect(n.toLowerCase()).toContain(between.secondary)
    }
  })

  it('the shape line carries the percentages', () => {
    expect(shapeLine(faceOf('oval'))).toMatch(/^Oval face \d+% · a bit \w+$/)
    const fake: FaceShapeResult = { ...faceOf('oval'), between: true }
    expect(shapeLine(fake)).toMatch(/^Oval \d+% · \w+ \d+%$/)
  })
})

describe('alt text', () => {
  const frames = [{ name: 'Oval', color: 'Jet Black' }, { name: 'Rimless', color: 'Silver' }, { name: 'Wayfarer', color: 'Havana Tortoise' }]

  it('describes the nickname, the shape, the three frames and the privacy line', () => {
    const t = shareAltText(faceOf('oval'), frames, true)
    expect(t).toContain('The Classic Oval')
    expect(t).toContain('1, Oval in Jet Black; 2, Rimless in Silver; 3, Wayfarer in Havana Tortoise')
    expect(t).toContain('wearing the selected glasses')
    expect(t).toContain('not a rule')
  })

  it('says what the picture shows when the photo is left out', () => {
    expect(shareAltText(faceOf('oval'), frames, false)).toContain('glasses on their own')
    expect(shareAltText(faceOf('oval'), [], true)).not.toContain('Top frames')
  })
})

describe('layout', () => {
  const L = shareLayout()

  it('is 1080 x 1920 and keeps everything on the card', () => {
    expect(SHARE.width).toBe(1080)
    expect(SHARE.height).toBe(1920)
    const rects = [L.photo, ...L.cards]
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(SHARE.width)
      expect(r.y + r.h).toBeLessThanOrEqual(SHARE.height)
    }
    expect(L.footer.y).toBeLessThanOrEqual(SHARE.height)
  })

  it('stacks top to bottom without overlap: brand, photo, nickname, shape line, heading, cards, footer', () => {
    expect(L.brand.y).toBeLessThan(L.photo.y)
    expect(L.nickname.y).toBeGreaterThan(L.photo.y + L.photo.h)
    expect(L.shapeLine.y).toBeGreaterThan(L.nickname.y)
    expect(L.heading.y).toBeGreaterThan(L.shapeLine.y)
    expect(L.cards[0]!.y).toBeGreaterThan(L.heading.y)
    expect(L.footer.y - SHARE.footer.size).toBeGreaterThan(L.cards[0]!.y + L.cards[0]!.h)
  })

  it('three cards of equal width fill the inner width exactly, with the gap between them', () => {
    const [a, b, c] = L.cards as [(typeof L.cards)[0], (typeof L.cards)[0], (typeof L.cards)[0]]
    expect(a.w).toBe(b.w)
    expect(b.w).toBe(c.w)
    expect(b.x - (a.x + a.w)).toBeCloseTo(SHARE.cards.gap, 9)
    expect(c.x + c.w).toBeCloseTo(SHARE.width - SHARE.margin, 9)
    expect(a.x).toBe(SHARE.margin)
  })

  it('the photo is square and margin-aligned', () => {
    expect(L.photo.w).toBe(L.photo.h)
    expect(L.photo.x).toBe(SHARE.margin)
    expect(L.photo.w).toBe(SHARE.width - 2 * SHARE.margin)
  })
})

describe('photo crop', () => {
  it('is centered on the eyes and sized by the cheekbone width', () => {
    const c = photoCrop(1280, 960, { x: 640, y: 400 }, 300)
    expect(c.side).toBe(300 * SHARE.cropFaceWidths)
    expect(c.sx).toBe(640 - c.side / 2)
    expect(c.sy).toBeCloseTo(400 - c.side * 0.45, 9)
  })

  it('stays inside the picture when the face is near an edge', () => {
    for (const eye of [{ x: 10, y: 10 }, { x: 1270, y: 950 }, { x: 10, y: 950 }]) {
      const c = photoCrop(1280, 960, eye, 400)
      expect(c.sx).toBeGreaterThanOrEqual(0)
      expect(c.sy).toBeGreaterThanOrEqual(0)
      expect(c.sx + c.side).toBeLessThanOrEqual(1280)
      expect(c.sy + c.side).toBeLessThanOrEqual(960)
    }
  })

  it('never asks for more than the picture holds (a close-up face)', () => {
    const c = photoCrop(1280, 960, { x: 640, y: 480 }, 900)
    expect(c.side).toBe(960)
    expect(c.sy).toBe(0)
  })
})
