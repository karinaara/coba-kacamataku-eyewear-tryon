import { describe, expect, it } from 'vitest'
import type { Point3 } from './landmarks'
import { evaluateQuality, isFrameUsable, summarizeReport, type CheckId, type QualityReport } from './quality'
import { ROI_INDICES } from './roi'

const SIZE = 100
const SKIN: [number, number, number] = [205, 155, 130]
const GRAY: [number, number, number] = [150, 150, 150]

type Rect = [x0: number, y0: number, x1: number, y1: number]

/** Synthetic frontal face in a 100x100 image. Everything is in normalized coordinates. */
function makeFace(opts: { faceScale?: number; eyeOpen?: number } = {}) {
  const s = opts.faceScale ?? 1
  const open = opts.eyeOpen ?? 0.03
  const at = (x: number, y: number): Point3 => ({ x: 0.5 + (x - 0.5) * s, y: 0.5 + (y - 0.5) * s, z: 0 })
  const lm: Point3[] = Array.from({ length: 478 }, () => at(0.5, 0.5))
  const put = (i: number, x: number, y: number) => (lm[i] = at(x, y))
  const ring = (idx: readonly number[], rect: Rect) => {
    const [x0, y0, x1, y1] = rect
    const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    idx.forEach((i, k) => put(i, ...(corners[k % 4] as [number, number])))
  }
  put(10, 0.5, 0.2)
  put(152, 0.5, 0.8)
  ring(ROI_INDICES.rightCheek, [0.28, 0.5, 0.42, 0.62])
  ring(ROI_INDICES.leftCheek, [0.58, 0.5, 0.72, 0.62])
  ring(ROI_INDICES.forehead.filter((i) => i !== 10), [0.38, 0.2, 0.62, 0.32])
  // Eyes: [outer, upper-outer, upper-inner, inner, lower-inner, lower-outer]
  const eye = (ids: readonly number[], x0: number, x1: number, inner: 'right' | 'left') => {
    const [p1, p2, p3, p4, p5, p6] = ids as [number, number, number, number, number, number]
    const xa = inner === 'right' ? x0 : x1 // outer x
    const xb = inner === 'right' ? x1 : x0 // inner x
    const w = x1 - x0
    put(p1, xa, 0.4)
    put(p4, xb, 0.4)
    put(p2, xa + (xb - xa) * 0.25, 0.4 - open / 2)
    put(p3, xa + (xb - xa) * 0.75, 0.4 - open / 2)
    put(p5, xa + (xb - xa) * 0.75, 0.4 + open / 2)
    put(p6, xa + (xb - xa) * 0.25, 0.4 + open / 2)
    void w
  }
  eye([33, 160, 158, 133, 153, 144], 0.28, 0.4, 'right')
  eye([263, 387, 385, 362, 380, 373], 0.6, 0.72, 'left')
  put(168, 0.5, 0.4)
  put(13, 0.5, 0.66)
  put(14, 0.5, 0.665)
  return lm
}

function makeImage(fills: { rect: Rect; rgb: [number, number, number] }[]) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4)
  const paint = (rect: Rect, rgb: [number, number, number]) => {
    for (let y = Math.round(rect[1] * SIZE); y < Math.round(rect[3] * SIZE); y++) {
      for (let x = Math.round(rect[0] * SIZE); x < Math.round(rect[2] * SIZE); x++) data.set([...rgb, 255], (y * SIZE + x) * 4)
    }
  }
  paint([0, 0, 1, 1], GRAY)
  fills.forEach((f) => paint(f.rect, f.rgb))
  return { data, width: SIZE, height: SIZE }
}

const RC: Rect = [0.28, 0.5, 0.42, 0.62]
const LC: Rect = [0.58, 0.5, 0.72, 0.62]
const FH: Rect = [0.38, 0.2, 0.62, 0.32]
const goodImage = () => makeImage([{ rect: RC, rgb: SKIN }, { rect: LC, rgb: SKIN }, { rect: FH, rgb: SKIN }])
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

const statusOf = (r: QualityReport, id: CheckId) => r.checks.find((c) => c.id === id)?.status
const tipOf = (r: QualityReport, id: CheckId) => r.checks.find((c) => c.id === id)?.tip ?? ''

describe('evaluateQuality', () => {
  it('passes a good frontal face', () => {
    const r = evaluateQuality({ landmarks: makeFace(), matrix: IDENTITY, image: goodImage() })
    const failing = r.checks.filter((c) => c.status !== 'pass').map((c) => c.id)
    expect(failing).toEqual([])
    expect(r.ready).toBe(true)
  })

  it('blocks a dark picture', () => {
    const dark: [number, number, number] = [30, 20, 15]
    const img = makeImage([{ rect: RC, rgb: dark }, { rect: LC, rgb: dark }, { rect: FH, rgb: dark }])
    const r = evaluateQuality({ landmarks: makeFace(), matrix: IDENTITY, image: img })
    expect(statusOf(r, 'lighting')).toBe('fail')
    expect(tipOf(r, 'lighting')).toMatch(/dark/i)
    expect(r.ready).toBe(false)
  })

  it('blocks an over-bright picture', () => {
    const bright: [number, number, number] = [255, 245, 235]
    const img = makeImage([{ rect: RC, rgb: bright }, { rect: LC, rgb: bright }, { rect: FH, rgb: bright }])
    const r = evaluateQuality({ landmarks: makeFace(), matrix: IDENTITY, image: img })
    expect(statusOf(r, 'lighting')).toBe('fail')
    expect(tipOf(r, 'lighting')).toMatch(/bright/i)
  })

  it('blocks uneven left/right lighting', () => {
    const img = makeImage([{ rect: RC, rgb: SKIN }, { rect: LC, rgb: [255, 215, 190] }, { rect: FH, rgb: SKIN }])
    const r = evaluateQuality({ landmarks: makeFace(), matrix: IDENTITY, image: img })
    expect(statusOf(r, 'lighting')).toBe('pass')
    expect(statusOf(r, 'evenLighting')).toBe('fail')
  })

  it('blocks hair or fabric over the forehead', () => {
    const hair: [number, number, number] = [40, 30, 25]
    const img = makeImage([{ rect: RC, rgb: SKIN }, { rect: LC, rgb: SKIN }, { rect: FH, rgb: hair }])
    const r = evaluateQuality({ landmarks: makeFace(), matrix: IDENTITY, image: img })
    expect(statusOf(r, 'hairOnForehead')).toBe('fail')
  })

  it('blocks closed eyes', () => {
    const r = evaluateQuality({ landmarks: makeFace({ eyeOpen: 0.004 }), matrix: IDENTITY, image: goodImage() })
    expect(statusOf(r, 'eyesOpen')).toBe('fail')
  })

  it('blocks a face that is too small, and says to move closer', () => {
    const r = evaluateQuality({ landmarks: makeFace({ faceScale: 0.5 }), matrix: IDENTITY, image: goodImage() })
    expect(statusOf(r, 'faceSize')).toBe('fail')
    expect(tipOf(r, 'faceSize')).toMatch(/closer/i)
  })

  it('blocks a turned head via the pose matrix', () => {
    const a = (20 * Math.PI) / 180
    const yawed = [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1]
    const r = evaluateQuality({ landmarks: makeFace(), matrix: yawed, image: goodImage() })
    expect(statusOf(r, 'pose')).toBe('fail')
    expect(r.pose?.yaw).toBeCloseTo(20, 3)
  })

  it('only warns for uploads, so the photo still goes through', () => {
    const dark: [number, number, number] = [30, 20, 15]
    const img = makeImage([{ rect: RC, rgb: dark }, { rect: LC, rgb: dark }, { rect: FH, rgb: dark }])
    const r = evaluateQuality({ landmarks: makeFace(), matrix: IDENTITY, image: img }, 'upload')
    expect(statusOf(r, 'lighting')).toBe('warn')
    expect(r.checks.some((c) => c.status === 'fail')).toBe(false)
    expect(r.ready).toBe(true)
  })

  it('warns, but does not block, on a strong color cast', () => {
    const img = makeImage([{ rect: RC, rgb: SKIN }, { rect: LC, rgb: SKIN }, { rect: FH, rgb: SKIN }])
    // Tint everything outside the skin regions orange.
    for (let i = 0; i < SIZE * SIZE; i++) {
      const x = i % SIZE
      const y = Math.floor(i / SIZE)
      const inRect = [RC, LC, FH].some((r) => x >= r[0] * SIZE && x < r[2] * SIZE && y >= r[1] * SIZE && y < r[3] * SIZE)
      if (!inRect) img.data.set([230, 150, 60, 255], i * 4)
    }
    const r = evaluateQuality({ landmarks: makeFace(), matrix: IDENTITY, image: img })
    expect(statusOf(r, 'colorCast')).toBe('warn')
    expect(r.ready).toBe(true)
  })
})

describe('summarizeReport', () => {
  it('collapses to four rows and surfaces the failing tip', () => {
    const dark: [number, number, number] = [30, 20, 15]
    const img = makeImage([{ rect: RC, rgb: dark }, { rect: LC, rgb: dark }, { rect: FH, rgb: dark }])
    const { groups, extras } = summarizeReport(evaluateQuality({ landmarks: makeFace(), matrix: IDENTITY, image: img }))
    expect(groups.map((g) => g.group)).toEqual(['position', 'lighting', 'forehead', 'expression'])
    expect(groups.find((g) => g.group === 'lighting')?.status).toBe('fail')
    expect(groups.find((g) => g.group === 'lighting')?.tip).not.toBe('')
    expect(groups.find((g) => g.group === 'position')?.status).toBe('pass')
    expect(extras.every((e) => e.status === 'warn')).toBe(true)
  })
})

describe('isFrameUsable', () => {
  it('accepts a steady open-eyed frame and rejects a blink or a turned head', () => {
    expect(isFrameUsable(makeFace(), IDENTITY, SIZE, SIZE)).toBe(true)
    expect(isFrameUsable(makeFace({ eyeOpen: 0.004 }), IDENTITY, SIZE, SIZE)).toBe(false)
    const a = (25 * Math.PI) / 180
    const yawed = [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1]
    expect(isFrameUsable(makeFace(), yawed, SIZE, SIZE)).toBe(false)
  })
})
