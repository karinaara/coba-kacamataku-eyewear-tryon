// Pulls skin, hair, iris and eye-white colors out of an image using the landmarks. Pure.

import { COLOR } from './config/color'
import { QUALITY } from './config/quality'
import { median, rgbToLab, type Lab } from './color'
import { EYE_CONTOUR_LEFT, EYE_CONTOUR_RIGHT, IRIS_RING_LEFT, IRIS_RING_RIGHT, LM, lmAt, type Point3 } from './landmarks'
import { convexHull, roiHull, samplePixels, scaleHull, type ImageLike, type Pixel, type Vec2 } from './roi'

export interface RegionStat {
  /** Median CIELAB of the pixels that survived gating. */
  lab: Lab
  /** How many pixels that was. */
  count: number
}

const toLab = (p: Pixel): Lab => rgbToLab(p.r, p.g, p.b)

/** Sorted by L*, then the darkest and brightest shares removed. */
function trimByLightness(labs: Lab[], dropDarkest: number, dropBrightest: number): Lab[] {
  const sorted = [...labs].sort((a, b) => a[0] - b[0])
  const lo = Math.floor(sorted.length * dropDarkest)
  const hi = sorted.length - Math.floor(sorted.length * dropBrightest)
  return sorted.slice(lo, Math.max(lo, hi))
}

export function medianLab(labs: readonly Lab[]): Lab | null {
  if (labs.length === 0) return null
  return [median(labs.map((l) => l[0])), median(labs.map((l) => l[1])), median(labs.map((l) => l[2]))]
}

const stat = (labs: Lab[]): RegionStat | null => {
  const lab = medianLab(labs)
  return lab ? { lab, count: labs.length } : null
}

const inSkinWindow = (l: Lab) =>
  l[1] >= COLOR.skin.aRange[0] && l[1] <= COLOR.skin.aRange[1] && l[2] >= COLOR.skin.bRange[0] && l[2] <= COLOR.skin.bRange[1]

const labDistance = (p: Lab, q: Lab, lWeight: number) => Math.hypot((p[0] - q[0]) * lWeight, p[1] - q[1], p[2] - q[2])

const px = (lm: readonly Point3[], i: number, img: ImageLike): Vec2 => {
  const p = lmAt(lm, i)
  return [p.x * img.width, p.y * img.height]
}
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1])

// ---- skin ----

export interface SkinSample {
  right: RegionStat | null
  left: RegionStat | null
  forehead: RegionStat | null
  /** Weighted (by pixel count) average of the region medians. */
  combined: Lab | null
  count: number
  /** Cheek disagreement: lightness, and distance in the a-b plane. null if a cheek is missing. */
  deltaL: number | null
  deltaAB: number | null
}

export function sampleSkin(lm: readonly Point3[], img: ImageLike): SkinSample {
  const { skin } = COLOR
  const region = (name: 'rightCheek' | 'leftCheek' | 'forehead', keep?: (l: Lab) => boolean): RegionStat | null => {
    const hull = scaleHull(roiHull(lm, name), img.width, img.height)
    let labs = samplePixels(img, hull).map(toLab).filter(inSkinWindow)
    if (keep) labs = labs.filter(keep)
    labs = trimByLightness(labs, skin.dropDarkestFrac, skin.dropBrightestFrac)
    return labs.length >= skin.minPixels ? stat(labs) : null
  }

  const right = region('rightCheek')
  const left = region('leftCheek')
  const cheeks = [right, left].filter((r): r is RegionStat => r !== null)
  // The forehead is only trusted where it looks like the cheeks, so hair and fabric over it drop out.
  const ref = cheeks.length
    ? ([
        cheeks.reduce((s, r) => s + r.lab[0] * r.count, 0) / cheeks.reduce((s, r) => s + r.count, 0),
        cheeks.reduce((s, r) => s + r.lab[1] * r.count, 0) / cheeks.reduce((s, r) => s + r.count, 0),
        cheeks.reduce((s, r) => s + r.lab[2] * r.count, 0) / cheeks.reduce((s, r) => s + r.count, 0),
      ] as Lab)
    : null
  const forehead = ref ? region('forehead', (l) => labDistance(l, ref, QUALITY.forehead.lWeight) <= QUALITY.forehead.maxDistance) : null

  const all = [right, left, forehead].filter((r): r is RegionStat => r !== null)
  const count = all.reduce((s, r) => s + r.count, 0)
  const combined: Lab | null = count
    ? [
        all.reduce((s, r) => s + r.lab[0] * r.count, 0) / count,
        all.reduce((s, r) => s + r.lab[1] * r.count, 0) / count,
        all.reduce((s, r) => s + r.lab[2] * r.count, 0) / count,
      ]
    : null

  return {
    right,
    left,
    forehead,
    combined,
    count,
    deltaL: right && left ? Math.abs(right.lab[0] - left.lab[0]) : null,
    deltaAB: right && left ? Math.hypot(right.lab[1] - left.lab[1], right.lab[2] - left.lab[2]) : null,
  }
}

// ---- hair ----

export interface HairSample {
  stat: RegionStat | null
  /** 'skin-like' = the box above the head looks like skin (bald, short or high hairline): not used. */
  source: 'sampled' | 'skin-like' | 'insufficient'
}

/** A box just above the top of the face mesh, aligned with the eye line. */
export function sampleHair(lm: readonly Point3[], img: ImageLike, skin: Lab): HairSample {
  const { hair } = COLOR
  const eyeR = px(lm, LM.irisRight, img)
  const eyeL = px(lm, LM.irisLeft, img)
  const len = dist(eyeR, eyeL) || 1
  const u: Vec2 = [(eyeL[0] - eyeR[0]) / len, (eyeL[1] - eyeR[1]) / len]
  const up: Vec2 = [u[1], -u[0]]
  const top = px(lm, LM.faceTop, img)
  const faceH = dist(top, px(lm, LM.chin, img))
  const hw = (dist(px(lm, 103, img), px(lm, 332, img)) / 2) * 0.9
  const [from, to] = hair.aboveFaceFrac
  const corner = (d: number, side: 1 | -1): Vec2 => [top[0] + up[0] * d * faceH + u[0] * hw * side, top[1] + up[1] * d * faceH + u[1] * hw * side]
  const hull = convexHull([corner(from, 1), corner(from, -1), corner(to, 1), corner(to, -1)])
  const labs = trimByLightness(samplePixels(img, hull).map(toLab), hair.dropDarkestFrac, hair.dropBrightestFrac)
  const s = labs.length >= hair.minPixels ? stat(labs) : null
  if (!s) return { stat: null, source: 'insufficient' }
  if (labDistance(s.lab, skin, 1) < hair.skinLikeDistance) return { stat: s, source: 'skin-like' }
  return { stat: s, source: 'sampled' }
}

// ---- eyes ----

export interface EyeSample {
  iris: RegionStat | null
  sclera: RegionStat | null
}

export function sampleEyes(lm: readonly Point3[], img: ImageLike): EyeSample {
  const { eye, sclera } = COLOR
  const irisLabs: Lab[] = []
  const scleraLabs: Lab[] = []

  for (const side of [
    { center: LM.irisRight, ring: IRIS_RING_RIGHT, contour: EYE_CONTOUR_RIGHT },
    { center: LM.irisLeft, ring: IRIS_RING_LEFT, contour: EYE_CONTOUR_LEFT },
  ]) {
    const c = px(lm, side.center, img)
    const r = side.ring.reduce((s, i) => s + dist(c, px(lm, i, img)), 0) / side.ring.length
    if (r < 1.5) continue // too small to sample meaningfully

    // Iris: an annulus that avoids the pupil and the lid.
    const box = convexHull([[c[0] - r, c[1] - r], [c[0] + r, c[1] - r], [c[0] + r, c[1] + r], [c[0] - r, c[1] + r]])
    const ring = samplePixels(img, box, (x, y) => {
      const d = Math.hypot(x - c[0], y - c[1])
      return d >= eye.ringInner * r && d <= eye.ringOuter * r
    })
    irisLabs.push(...trimByLightness(ring.map(toLab), eye.dropDarkestFrac, eye.dropBrightestFrac))

    // Eye white: the brightest part of the eye opening, outside the iris.
    const contour = convexHull(side.contour.map((i) => px(lm, i, img)))
    const open = samplePixels(img, contour, (x, y) => Math.hypot(x - c[0], y - c[1]) > sclera.irisClear * r).map(toLab)
    const bright = [...open].sort((a, b) => b[0] - a[0]).slice(0, Math.ceil(open.length * sclera.brightestKeepFrac))
    scleraLabs.push(...bright)
  }

  return {
    iris: irisLabs.length >= eye.minPixels ? stat(irisLabs) : null,
    sclera: scleraLabs.length >= sclera.minPixels ? stat(scleraLabs) : null,
  }
}
