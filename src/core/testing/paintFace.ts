// Test helper: paints a picture with KNOWN colors over the real landmark geometry of a fixture,
// so the color pipeline can be checked against exact ground truth. Not shipped to users.

import { FIXTURES } from '../fixtures'
import { EYE_CONTOUR_LEFT, EYE_CONTOUR_RIGHT, IRIS_RING_LEFT, IRIS_RING_RIGHT, LM, type Point3 } from '../landmarks'
import { convexHull, pointInConvex, type ImageLike, type Vec2 } from '../roi'

export type RGB = [number, number, number]

export interface FaceColors {
  skin: RGB
  /** Skin on the image-right half of the face, if it should differ (uneven lighting). */
  skinOtherSide?: RGB
  hair: RGB
  iris: RGB
  sclera: RGB
  background: RGB
}

const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

export const FIXTURE = FIXTURES[0]!

export function paintFace(colors: FaceColors, width = 640): { image: ImageLike; landmarks: Point3[] } {
  const height = Math.round((width * FIXTURE.size.height) / FIXTURE.size.width)
  const data = new Uint8ClampedArray(width * height * 4)
  const lm = FIXTURE.landmarks
  const P = (i: number): Vec2 => [(lm[i] as Point3).x * width, (lm[i] as Point3).y * height]

  const fill = (hull: readonly Vec2[], rgb: RGB, accept?: (x: number, y: number) => boolean) => {
    const xs = hull.map((p) => p[0])
    const ys = hull.map((p) => p[1])
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(height - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(width - 1, Math.ceil(Math.max(...xs))); x++) {
        if (!pointInConvex(hull, x + 0.5, y + 0.5)) continue
        if (accept && !accept(x + 0.5, y + 0.5)) continue
        data.set([...rgb, 255], (y * width + x) * 4)
      }
    }
  }
  const whole: Vec2[] = [[0, 0], [width, 0], [width, height], [0, height]]

  fill(whole, colors.background)
  // Hair: everything above the top of the face mesh.
  const topY = P(LM.faceTop)[1]
  fill(whole, colors.hair, (_x, y) => y < topY)
  // Skin: the face oval, optionally lit differently on the two halves.
  const oval = convexHull(OVAL.map(P))
  const midX = P(LM.noseTip)[0]
  fill(oval, colors.skin)
  if (colors.skinOtherSide) fill(oval, colors.skinOtherSide, (x) => x > midX)
  // Eyes: white of the eye, then the iris disc on top.
  for (const [contour, center, ring] of [
    [EYE_CONTOUR_RIGHT, LM.irisRight, IRIS_RING_RIGHT],
    [EYE_CONTOUR_LEFT, LM.irisLeft, IRIS_RING_LEFT],
  ] as const) {
    fill(convexHull(contour.map(P)), colors.sclera)
    const c = P(center)
    const r = ring.reduce((s, i) => s + Math.hypot(P(i)[0] - c[0], P(i)[1] - c[1]), 0) / ring.length
    fill(convexHull([[c[0] - r, c[1] - r], [c[0] + r, c[1] - r], [c[0] + r, c[1] + r], [c[0] - r, c[1] + r]]), colors.iris, (x, y) => Math.hypot(x - c[0], y - c[1]) <= r)
  }
  return { image: { data, width, height }, landmarks: lm }
}

export const scaled = (rgb: RGB, f: number): RGB => [Math.min(255, rgb[0] * f), Math.min(255, rgb[1] * f), Math.min(255, rgb[2] * f)]
