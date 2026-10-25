// Skin sampling regions built from landmarks, and pixel sampling inside them. Pure.
//
// Each region is the convex hull of a few landmarks, so the order of the indices does not matter.
// Right/left are the subject's. Left-cheek indices are the mesh mirror of the right-cheek ones.
// These picks are starting points; verify them visually with the "sample areas" overlay.

import { QUALITY } from './config/quality'
import { lmAt, type Point3 } from './landmarks'

export const ROI_INDICES = {
  rightCheek: [116, 117, 118, 101, 36, 205, 187, 123],
  leftCheek: [345, 346, 347, 330, 266, 425, 411, 352],
  // Mesh top edge down to the top of the brows (105 / 334).
  forehead: [103, 67, 109, 10, 338, 297, 332, 334, 105],
} as const

export type RoiName = keyof typeof ROI_INDICES
export type Vec2 = readonly [x: number, y: number]

export interface ImageLike {
  data: ArrayLike<number>
  width: number
  height: number
}

const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Andrew's monotone chain. Returns hull vertices without repeating the first point. */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const lower: Vec2[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2] as Vec2, lower[lower.length - 1] as Vec2, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Vec2[] = []
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2] as Vec2, upper[upper.length - 1] as Vec2, p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

export function pointInConvex(hull: readonly Vec2[], x: number, y: number): boolean {
  if (hull.length < 3) return false
  let sign = 0
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i] as Vec2
    const b = hull[(i + 1) % hull.length] as Vec2
    const c = cross(a, b, [x, y])
    if (c === 0) continue
    const s = c > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/** Scales a hull about the mean of its vertices. */
export function shrinkHull(hull: readonly Vec2[], factor: number): Vec2[] {
  if (hull.length === 0) return []
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length
  return hull.map(([x, y]): Vec2 => [cx + (x - cx) * factor, cy + (y - cy) * factor])
}

/** Hull in the same (normalized) coordinates as the landmarks, shrunk by `QUALITY.roiScale`. */
export function roiHull(landmarks: readonly Point3[], name: RoiName): Vec2[] {
  const hull = convexHull(ROI_INDICES[name].map((i): Vec2 => [lmAt(landmarks, i).x, lmAt(landmarks, i).y]))
  return shrinkHull(hull, name === 'forehead' ? QUALITY.roiScale.forehead : QUALITY.roiScale.cheek)
}

export const scaleHull = (hull: readonly Vec2[], w: number, h: number): Vec2[] =>
  hull.map(([x, y]): Vec2 => [x * w, y * h])

export interface Pixel {
  r: number
  g: number
  b: number
}

/**
 * RGBA pixels whose centers fall inside a pixel-space convex hull. `accept` can further filter by
 * pixel center (for example to leave out an iris disc).
 */
export function samplePixels(img: ImageLike, hullPx: readonly Vec2[], accept?: (x: number, y: number) => boolean): Pixel[] {
  if (hullPx.length < 3) return []
  const xs = hullPx.map((p) => p[0])
  const ys = hullPx.map((p) => p[1])
  const x0 = Math.max(0, Math.floor(Math.min(...xs)))
  const x1 = Math.min(img.width - 1, Math.ceil(Math.max(...xs)))
  const y0 = Math.max(0, Math.floor(Math.min(...ys)))
  const y1 = Math.min(img.height - 1, Math.ceil(Math.max(...ys)))
  const out: Pixel[] = []
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!pointInConvex(hullPx, x + 0.5, y + 0.5)) continue
      if (accept && !accept(x + 0.5, y + 0.5)) continue
      const i = (y * img.width + x) * 4
      out.push({ r: Number(img.data[i]), g: Number(img.data[i + 1]), b: Number(img.data[i + 2]) })
    }
  }
  return out
}
