// Lens outlines as point lists in millimeters, for the 3D frames. Pure, no three.js.
//
// Same shape as the 2D generator draws (it reuses its corner rules), converted to model space:
// x to the subject's left (image right when facing the camera), y up, origin at the middle of the lenses
// and the middle of the bridge.

import type { FrameStyle } from '../core/config/frames'
import { lensPoints } from './generate'

export interface P2 {
  x: number
  y: number
}

const KAPPA = 0.5523
const lerp = (a: P2, b: P2, t: number): P2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

function cubic(p0: P2, p1: P2, p2: P2, p3: P2, t: number): P2 {
  const u = 1 - t
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
  return { x: w[0]! * p0.x + w[1]! * p1.x + w[2]! * p2.x + w[3]! * p3.x, y: w[0]! * p0.y + w[1]! * p1.y + w[2]! * p2.y + w[3]! * p3.y }
}

/** Points along the closed rounded polygon the 2D generator draws (corner radius 0 = sharp, 1 = half of each edge). */
export function sampleRoundedPolygon(pts: readonly P2[], radii: readonly number[], perCorner: number): P2[] {
  const n = pts.length
  const out: P2[] = []
  for (let i = 0; i < n; i++) {
    const v = pts[i] as P2
    const prev = pts[(i + n - 1) % n] as P2
    const next = pts[(i + 1) % n] as P2
    const k = Math.min(0.5, Math.max(0, (radii[i] ?? 0) * 0.5))
    const a = lerp(v, prev, k)
    const b = lerp(v, next, k)
    if (k === 0) {
      out.push(v)
      continue
    }
    const c1 = lerp(a, v, KAPPA)
    const c2 = lerp(b, v, KAPPA)
    for (let s = 0; s <= perCorner; s++) out.push(cubic(a, c1, c2, b, s / perCorner))
  }
  return dedupe(out)
}

/** Drops consecutive points that coincide (sharp corners and zero-length edges), including the wrap-around. */
export function dedupe(pts: readonly P2[], eps = 1e-6): P2[] {
  const out: P2[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > eps) out.push(p)
  }
  while (out.length > 1 && Math.hypot((out[0] as P2).x - (out[out.length - 1] as P2).x, (out[0] as P2).y - (out[out.length - 1] as P2).y) <= eps) out.pop()
  return out
}

export const signedArea = (pts: readonly P2[]) => {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as P2
    const q = pts[(i + 1) % pts.length] as P2
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

export const ensureCcw = (pts: readonly P2[]): P2[] => (signedArea(pts) < 0 ? [...pts].reverse() : [...pts])

/**
 * Moves every point of a counter-clockwise polygon along its (mitered) normal by `d`:
 * positive grows the shape, negative shrinks it. The miter is capped so sharp corners do not spike.
 */
export function offsetPolygon(ccw: readonly P2[], d: number, miterLimit = 2): P2[] {
  const n = ccw.length
  return ccw.map((p, i) => {
    const prev = ccw[(i + n - 1) % n] as P2
    const next = ccw[(i + 1) % n] as P2
    const e1 = { x: p.x - prev.x, y: p.y - prev.y }
    const e2 = { x: next.x - p.x, y: next.y - p.y }
    const l1 = Math.hypot(e1.x, e1.y) || 1
    const l2 = Math.hypot(e2.x, e2.y) || 1
    // Outward normal of a counter-clockwise edge is the direction rotated clockwise.
    const n1 = { x: e1.y / l1, y: -e1.x / l1 }
    const n2 = { x: e2.y / l2, y: -e2.x / l2 }
    const sum = { x: n1.x + n2.x, y: n1.y + n2.y }
    const sl = Math.hypot(sum.x, sum.y) || 1
    const m = { x: sum.x / sl, y: sum.y / sl }
    const cosHalf = Math.max(1 / miterLimit, m.x * n1.x + m.y * n1.y)
    const k = d / cosHalf
    return { x: p.x + m.x * k, y: p.y + m.y * k }
  })
}

/**
 * The left lens (image-left, i.e. the subject's right) and its mirror, centerline of the rim, in mm.
 * `perCorner` is how many samples each rounded corner gets.
 */
export function lensOutlines(style: FrameStyle, perCorner: number): { left: P2[]; right: P2[] } {
  const cx = -(style.bridgeW / 2 + style.lensW / 2)
  const { pts, radii } = lensPoints(style, cx, style.lensW, style.lensH)
  const flipY = (p: P2): P2 => ({ x: p.x, y: -p.y })
  const left = ensureCcw(sampleRoundedPolygon(pts, radii, perCorner).map(flipY))
  const right = ensureCcw(left.map((p) => ({ x: -p.x, y: p.y })))
  return { left, right }
}
