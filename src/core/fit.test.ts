import { describe, expect, it } from 'vitest'
import { FIT } from './config/tryon'
import { computeFit, fitPointsFromLandmarks, type FitPoints } from './fit'
import { FIXTURES } from './fixtures'

const FRONT_W = 1000
const FRONT_H = 400

/** A frontal face centered at (cx, cy) whose cheekbones are `width` px apart. */
function face(width: number, cx = 640, cy = 360): FitPoints {
  const eye = width * 0.19
  return {
    irisRight: { x: cx - eye, y: cy },
    irisLeft: { x: cx + eye, y: cy },
    cheekRight: { x: cx - width / 2, y: cy + width * 0.05 },
    cheekLeft: { x: cx + width / 2, y: cy + width * 0.05 },
    bridge: { x: cx, y: cy },
    noseTip: { x: cx, y: cy + width * 0.25 },
    // A 136 mm wide face has an 11.7 mm iris.
    irisDiameterPx: (width * 11.7) / 136,
  }
}

/** Rotates every point about (cx, cy) by `deg` (clockwise on screen, y down). */
function rotated(p: FitPoints, deg: number, cx = 640, cy = 360): FitPoints {
  const a = (deg * Math.PI) / 180
  const r = (v: { x: number; y: number }) => ({
    x: cx + (v.x - cx) * Math.cos(a) - (v.y - cy) * Math.sin(a),
    y: cy + (v.x - cx) * Math.sin(a) + (v.y - cy) * Math.cos(a),
  })
  return { irisRight: r(p.irisRight), irisLeft: r(p.irisLeft), cheekRight: r(p.cheekRight), cheekLeft: r(p.cheekLeft), bridge: r(p.bridge), noseTip: r(p.noseTip), irisDiameterPx: p.irisDiameterPx }
}

const fit = (p: FitPoints, yaw = 0, size = 1) => computeFit(p, yaw, FRONT_W, FRONT_H, size)

describe('on the real fixture', () => {
  const fx = FIXTURES[0]!
  const pts = fitPointsFromLandmarks(fx.landmarks, fx.size.width, fx.size.height)
  const f = computeFit(pts, fx.pose.yaw, FRONT_W, FRONT_H, 1)

  it('reads the right landmarks: eyes inside the cheeks, cheeks wider than the eyes', () => {
    expect(pts.irisRight.x).toBeLessThan(pts.irisLeft.x)
    expect(pts.cheekRight.x).toBeLessThan(pts.irisRight.x)
    expect(pts.cheekLeft.x).toBeGreaterThan(pts.irisLeft.x)
    expect(pts.noseTip.y).toBeGreaterThan(pts.bridge.y)
  })

  it('puts the frame on the eyes, as wide as the cheekbones, tilted like the eye line', () => {
    const midY = (pts.irisRight.y + pts.irisLeft.y) / 2
    expect(Math.abs(f.cy - midY)).toBeLessThan(10)
    expect(f.cx).toBeGreaterThan(pts.irisRight.x)
    expect(f.cx).toBeLessThan(pts.irisLeft.x)
    // yaw is small, so the width is about the raw cheekbone distance.
    const cheek = Math.hypot(pts.cheekLeft.x - pts.cheekRight.x, pts.cheekLeft.y - pts.cheekRight.y)
    expect(f.frontWidthPx / cheek).toBeCloseTo(1 / Math.cos((fx.pose.yaw * Math.PI) / 180), 3)
    expect(Math.abs((f.rotation * 180) / Math.PI)).toBeLessThan(10)
  })
})

describe('computeFit: real-world size from the iris ruler', () => {
  const mm = (p: FitPoints, frameMm: number, size = 1) => computeFit(p, 0, FRONT_W, FRONT_H, size, frameMm)

  it('sizes a frame by its real width, using the iris as the ruler', () => {
    const f = mm(face(400), 128)
    expect(f.scaleBasis).toBe('iris')
    // 400 px face = 136 mm, so 1 mm = 2.94 px, and a 128 mm frame is 376 px wide.
    expect(f.frontWidthPx).toBeCloseTo(128 * (400 / 136), 6)
  })

  it('different frames come out different widths on the same face', () => {
    const narrow = mm(face(400), 117).frontWidthPx
    const wide = mm(face(400), 145).frontWidthPx
    expect(wide / narrow).toBeCloseTo(145 / 117, 6)
  })

  it('sizes S/M/L change the real width by 0.94 / 1 / 1.06', () => {
    const m = mm(face(400), 128).frontWidthPx
    expect(mm(face(400), 128, 0.94).frontWidthPx / m).toBeCloseTo(0.94, 6)
    expect(mm(face(400), 128, 1.06).frontWidthPx / m).toBeCloseTo(1.06, 6)
  })

  it('follows the iris, not the cheek outline, and scales with the picture', () => {
    const p = face(400)
    const widerCheeks = { ...p, cheekRight: { x: p.cheekRight.x - 60, y: p.cheekRight.y }, cheekLeft: { x: p.cheekLeft.x + 60, y: p.cheekLeft.y } }
    expect(mm(widerCheeks, 128).frontWidthPx).toBeCloseTo(mm(p, 128).frontWidthPx, 6)
    expect(mm(face(800), 128).frontWidthPx / mm(face(200), 128).frontWidthPx).toBeCloseTo(4, 6)
  })

  it('falls back to the cheek ruler when the iris is too small to measure, or no width is given', () => {
    const tiny = { ...face(400), irisDiameterPx: 2 }
    expect(mm(tiny, 128).scaleBasis).toBe('cheek')
    expect(mm(tiny, 128).frontWidthPx).toBeCloseTo(400, 6)
    expect(computeFit(face(400), 0, FRONT_W, FRONT_H, 1, null).scaleBasis).toBe('cheek')
  })
})

describe('computeFit: size', () => {
  it('frame front is as wide as the cheekbones times the fit factor', () => {
    const f = fit(face(400))
    expect(f.frontWidthPx).toBeCloseTo(400 * FIT.fitFactor, 6)
    expect(f.scaleY * FRONT_W).toBeCloseTo(f.frontWidthPx, 6)
  })

  it('scales linearly across face sizes (a face twice as big gets a frame twice as big)', () => {
    const small = fit(face(150))
    const big = fit(face(600))
    expect(big.scaleY / small.scaleY).toBeCloseTo(4, 6)
    for (const w of [90, 200, 333, 520, 800]) expect(fit(face(w)).frontWidthPx / w).toBeCloseTo(FIT.fitFactor, 6)
  })

  it('S, M, L change the width by 0.94 / 1 / 1.06', () => {
    const m = fit(face(400), 0, 1.0).frontWidthPx
    expect(fit(face(400), 0, 0.94).frontWidthPx / m).toBeCloseTo(0.94, 6)
    expect(fit(face(400), 0, 1.06).frontWidthPx / m).toBeCloseTo(1.06, 6)
  })
})

describe('computeFit: position and roll', () => {
  it('centers on the eyes for a straight-on face', () => {
    const f = fit(face(400, 300, 200))
    expect(f.cx).toBeCloseTo(300, 6)
    expect(f.cy).toBeCloseTo(200, 6)
    expect(f.rotation).toBeCloseTo(0, 9)
  })

  it('follows the face when it moves', () => {
    const a = fit(face(400, 300, 200))
    const b = fit(face(400, 500, 260))
    expect(b.cx - a.cx).toBeCloseTo(200, 6)
    expect(b.cy - a.cy).toBeCloseTo(60, 6)
  })

  it('rotates with the eye line, in both directions, without changing size', () => {
    for (const deg of [-25, -8, 12, 30]) {
      const f = fit(rotated(face(400), deg))
      expect((f.rotation * 180) / Math.PI).toBeCloseTo(deg, 6)
      expect(f.frontWidthPx).toBeCloseTo(400, 6)
    }
  })

  it('moves toward the nose bridge by the configured weight', () => {
    const p = face(400)
    p.bridge = { x: p.bridge.x + 20, y: p.bridge.y }
    const f = fit(p)
    expect(f.cx - 640).toBeCloseTo(20 * FIT.bridgeWeight, 6)
  })
})

describe('computeFit: yaw', () => {
  // A turned head: cheeks look narrower, the nose shifts toward the side it points to.
  const turned = (yaw: number, noseDir: 1 | -1) => {
    const p = face(400 * Math.cos((yaw * Math.PI) / 180))
    p.noseTip = { x: 640 + noseDir * 400 * Math.sin((yaw * Math.PI) / 180) * 0.4, y: p.noseTip.y }
    return p
  }

  it('keeps the frame height steady and squashes the width by cos(yaw)', () => {
    const frontal = fit(face(400))
    const f = fit(turned(30, 1), 30)
    expect(f.scaleY).toBeCloseTo(frontal.scaleY, 6)
    expect(f.scaleX).toBeCloseTo(frontal.scaleY * Math.cos((30 * Math.PI) / 180), 6)
    expect(f.templeScale).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 9)
  })

  it('fades the temple on the side the nose points to, and not the other', () => {
    const right = fit(turned(20, 1), 20)
    expect(right.rightTempleAlpha).toBeLessThan(1)
    expect(right.leftTempleAlpha).toBe(1)
    const left = fit(turned(20, -1), 20)
    expect(left.leftTempleAlpha).toBeLessThan(1)
    expect(left.rightTempleAlpha).toBe(1)
  })

  it('shows both temples when frontal and hides the far one past 25 degrees', () => {
    const frontal = fit(face(400))
    expect(frontal.leftTempleAlpha).toBe(1)
    expect(frontal.rightTempleAlpha).toBe(1)
    expect(fit(turned(8, 1), 8).rightTempleAlpha).toBe(1)
    expect(fit(turned(26, 1), 26).rightTempleAlpha).toBe(0)
  })

  it('fades the whole frame for extreme turns and never blows up', () => {
    expect(fit(turned(10, 1), 10).frontAlpha).toBe(1)
    expect(fit(turned(60, 1), 60).frontAlpha).toBe(0)
    for (const yaw of [0, 20, 50, 80, 89]) {
      const f = fit(turned(Math.min(yaw, 60), 1), yaw)
      expect(Number.isFinite(f.scaleX) && Number.isFinite(f.scaleY)).toBe(true)
      expect(f.scaleX).toBeGreaterThan(0)
    }
  })

  it('uses the yaw magnitude, whatever its sign', () => {
    const p = turned(20, 1)
    expect(fit(p, -20)).toEqual(fit(p, 20))
  })
})
