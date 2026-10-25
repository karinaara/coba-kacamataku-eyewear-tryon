// Parametric frame generator: (style, color, tint) -> SVG string. No image assets, no DOM. Pure.
//
// Geometry: the frame front is rescaled to FRAME_RENDER.frontWidth units wide and centered on x = 0,
// with y = 0 at the middle of the lenses. Only the left lens is built; the right one mirrors it.

import { FRAME_RENDER, frameFrontMm, type FrameStyle, type LensTintId } from '../core/config/frames'
import type { FrameColor } from '../core/config/colors'
import { hashString, paintFor, pairedMetal, type Paint } from './materials'

interface Pt {
  x: number
  y: number
}

export interface FrameAnchors {
  leftLensCenter: Pt
  rightLensCenter: Pt
  bridge: Pt
  leftHinge: Pt
  rightHinge: Pt
}

export interface GeneratedFrame {
  svg: string
  /** SVG viewBox size. */
  width: number
  height: number
  /** Real-world width of the frame front in mm, for sizing against the iris. */
  frontMm: number
  /** The viewBox itself (its origin is negative: x = 0 is the frame center). */
  viewBox: { x: number; y: number; w: number; h: number }
  /** The frame front (hinge to hinge) inside the viewBox: this is the part that gets sized to the face. */
  frontBox: { x: number; y: number; w: number; h: number }
  /** Key points in the SVG's own coordinates (x = 0 is the frame center, y = 0 the middle of the lenses). */
  anchors: FrameAnchors
}

const KAPPA = 0.5523 // cubic control distance that turns a 90-degree corner into a true ellipse arc
const f = (v: number) => (Math.round(v * 10) / 10).toString()
const P = (p: Pt) => `${f(p.x)} ${f(p.y)}`
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** Closed polygon with each corner rounded. radius 0 = sharp, 1 = corner takes half of each edge. */
export function roundedPolygon(pts: readonly Pt[], radii: readonly number[]): string {
  const n = pts.length
  let d = ''
  for (let i = 0; i < n; i++) {
    const v = pts[i] as Pt
    const prev = pts[(i + n - 1) % n] as Pt
    const next = pts[(i + 1) % n] as Pt
    const k = Math.min(0.5, Math.max(0, (radii[i] ?? 0) * 0.5))
    const a = lerp(v, prev, k)
    const b = lerp(v, next, k)
    const c1 = lerp(a, v, KAPPA)
    const c2 = lerp(b, v, KAPPA)
    d += `${i === 0 ? 'M' : 'L'}${P(a)}C${P(c1)} ${P(c2)} ${P(b)}`
  }
  return d + 'Z'
}

const mirror = (p: Pt): Pt => ({ x: -p.x, y: p.y })

export function lensPoints(s: FrameStyle, cx: number, W: number, H: number): { pts: Pt[]; radii: number[] } {
  const x0 = cx - W / 2
  const x1 = cx + W / 2
  const y0 = -H / 2
  const y1 = H / 2
  if (s.polygon === 6) {
    const c = 0.23 * W
    return {
      pts: [{ x: x0 + c, y: y0 }, { x: x1 - c, y: y0 }, { x: x1, y: 0 }, { x: x1 - c, y: y1 }, { x: x0 + c, y: y1 }, { x: x0, y: 0 }],
      radii: Array<number>(6).fill(s.corners[0]),
    }
  }
  if (s.polygon === 8) {
    const cw = 0.29 * W
    const ch = 0.29 * H
    return {
      pts: [
        { x: x0 + cw, y: y0 }, { x: x1 - cw, y: y0 }, { x: x1, y: y0 + ch }, { x: x1, y: y1 - ch },
        { x: x1 - cw, y: y1 }, { x: x0 + cw, y: y1 }, { x: x0, y: y1 - ch }, { x: x0, y: y0 + ch },
      ],
      radii: Array<number>(8).fill(s.corners[0]),
    }
  }
  const inset = s.taper * 0.26 * W
  return {
    pts: [
      { x: x0 - s.upsweep * 0.05 * W, y: y0 - s.upsweep * 0.45 * H }, // outer-top, lifted by upsweep
      { x: x1, y: y0 }, // inner-top
      { x: x1 - inset, y: y1 }, // inner-bottom
      { x: x0 + inset, y: y1 }, // outer-bottom
    ],
    radii: [...s.corners],
  }
}

const TINT_FILL: Record<Exclude<LensTintId, 'brown-gradient'>, { fill: string; opacity: number }> = {
  clear: { fill: '#D6E6EE', opacity: 0.1 },
  'light-grey': { fill: '#4B5563', opacity: 0.24 },
  dark: { fill: '#0B1220', opacity: 0.86 },
}

/**
 * Draws one frame. `idPrefix` keeps ids unique if several frames are ever inlined into one page.
 */
export function generateFrame(style: FrameStyle, color: FrameColor, tint: LensTintId, idPrefix = 'f'): GeneratedFrame {
  const s = style
  const k = FRAME_RENDER.frontWidth / (2 * s.lensW + s.bridgeW + s.rimThickness)
  const W = s.lensW * k
  const H = s.lensH * k
  const B = s.bridgeW * k
  const R = s.rimThickness * k
  const BT = (s.browThickness ?? 0) * k
  const cxL = -(B / 2 + W / 2)
  const id = `${idPrefix}${(hashString(`${s.id}|${color.id}|${tint}`) % 0xffffff).toString(36)}`

  const left = lensPoints(s, cxL, W, H)
  const right = { pts: left.pts.map(mirror), radii: left.radii }
  const dL = roundedPolygon(left.pts, left.radii)
  const dR = roundedPolygon(right.pts, right.radii)

  const ys = left.pts.map((p) => p.y)
  const frameTop = Math.min(...ys) - BT - R / 2
  const frameBottom = Math.max(...ys) + R / 2
  const bodyPaint = paintFor(color, `${id}b`, frameTop, frameBottom)
  // Two-tone (browline): the color on the brow bar, a matching metal on the lower rim.
  const lowerPaint: Paint = s.twoTone ? paintFor(pairedMetal(color), `${id}m`, frameTop, frameBottom) : bodyPaint
  const defsExtra = s.twoTone && lowerPaint !== bodyPaint ? lowerPaint.defs : ''

  const TL = left.pts[0] as Pt
  const TR = left.pts[1] as Pt
  const y0 = -H / 2
  const hingeL: Pt = { x: TL.x - R * 0.1, y: y0 + 0.22 * H - s.upsweep * 0.3 * H }
  const hingeR = mirror(hingeL)
  const bridgeAnchor: Pt = { x: 0, y: y0 + 0.3 * H }

  // ---- layers, back to front ----
  const attr = (p: Paint, extra = '') => `fill="none" stroke="${p.fill}" stroke-opacity="${p.opacity}" stroke-linecap="round" stroke-linejoin="round"${extra}`
  const outline = (d: string, w: number, p: Paint) =>
    p.outline ? `<path d="${d}" fill="none" stroke="${p.outline}" stroke-opacity="0.55" stroke-width="${f(w + 4)}" stroke-linecap="round" stroke-linejoin="round"/>` : ''

  // Temples (front-view stubs).
  const templeW = s.templeStyle === 'thin-metal' ? Math.max(6, R * 0.5) : s.templeStyle === 'straight' ? R * 0.8 : Math.max(14, R * 1.1)
  const stub = FRAME_RENDER.templeStubLength
  const templePaint = s.templeStyle === 'thin-metal' && s.twoTone ? lowerPaint : bodyPaint
  const temple = (h: Pt, dir: -1 | 1) => `M${P(h)}L${P({ x: h.x + dir * stub, y: h.y + 0.05 * H })}`
  const temples = `<path d="${temple(hingeL, -1)}${temple(hingeR, 1)}" ${attr(templePaint, ` stroke-width="${f(templeW)}"`)}/>`

  // Lenses with their tint.
  const tintDefs =
    tint === 'brown-gradient'
      ? `<linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A2C14" stop-opacity="0.78"/><stop offset="1" stop-color="#4A2C14" stop-opacity="0.12"/></linearGradient>`
      : ''
  const tintAttrs =
    tint === 'brown-gradient' ? `fill="url(#${id}t)"` : `fill="${TINT_FILL[tint].fill}" fill-opacity="${TINT_FILL[tint].opacity}"`
  const bigRect = (cx: number) => `<rect x="${f(cx - W)}" y="${f(-H)}" width="${f(2 * W)}" height="${f(2 * H)}" ${tintAttrs}/>`
  const glint = (cx: number) =>
    `<path d="M${f(cx - W * 0.28)} ${f(-H)}L${f(cx - W * 0.1)} ${f(-H)}L${f(cx - W * 0.34)} ${f(H)}L${f(cx - W * 0.52)} ${f(H)}Z" fill="#fff" fill-opacity="${tint === 'clear' ? 0.1 : 0.16}"/>`
  const lenses =
    `<clipPath id="${id}cl"><path d="${dL}"/></clipPath><clipPath id="${id}cr"><path d="${dR}"/></clipPath>` +
    `<g clip-path="url(#${id}cl)">${bigRect(cxL)}${glint(cxL)}</g><g clip-path="url(#${id}cr)">${bigRect(-cxL)}${glint(-cxL)}</g>`

  // Rims.
  let rims = ''
  if (s.rim === 'full') {
    rims += outline(dL, R, lowerPaint) + outline(dR, R, lowerPaint)
    rims += `<path d="${dL}" ${attr(lowerPaint, ` stroke-width="${f(R)}"`)}/><path d="${dR}" ${attr(lowerPaint, ` stroke-width="${f(R)}"`)}/>`
  } else if (s.rim === 'half-top') {
    const cut = y0 + 0.38 * H
    rims +=
      `<clipPath id="${id}ht"><rect x="${f(-W * 3)}" y="${f(-H * 2)}" width="${f(W * 6)}" height="${f(cut + H * 2)}"/></clipPath>` +
      `<path d="${dL}${dR}" fill="none" stroke="#6B7280" stroke-opacity="0.7" stroke-width="2.2"/>` +
      `<g clip-path="url(#${id}ht)">${outline(dL, R, bodyPaint)}${outline(dR, R, bodyPaint)}<path d="${dL}" ${attr(bodyPaint, ` stroke-width="${f(R)}"`)}/><path d="${dR}" ${attr(bodyPaint, ` stroke-width="${f(R)}"`)}/></g>`
  } else {
    rims += `<path d="${dL}${dR}" fill="none" stroke="#FFFFFF" stroke-opacity="0.7" stroke-width="5"/><path d="${dL}${dR}" fill="none" stroke="#4B5563" stroke-opacity="0.75" stroke-width="2"/>`
  }

  // Extra-thick brow bar on top of the lens (wayfarer, browline, shield).
  let brow = ''
  if (BT > 0) {
    const bar = (a: Pt, b: Pt) =>
      `M${P({ x: a.x - R * 0.15, y: a.y - BT })}L${P({ x: b.x + R * 0.1, y: b.y - BT * 0.85 })}L${P({ x: b.x, y: b.y + R * 0.2 })}L${P({ x: a.x, y: a.y + R * 0.2 })}Z`
    const bl = bar(TL, TR)
    const br = bar(mirror(TL), mirror(TR))
    brow = `${outline(bl, 4, bodyPaint)}${outline(br, 4, bodyPaint)}<path d="${bl}${br}" fill="${bodyPaint.fill}" fill-opacity="${bodyPaint.opacity}" stroke="${bodyPaint.fill}" stroke-opacity="${bodyPaint.opacity}" stroke-width="${f(R * 0.6)}" stroke-linejoin="round"/>`
  }

  // Bridge.
  const yb = (t: number) => y0 + t * H
  let bridge = ''
  const bp = s.rim === 'half-top' || s.rim === 'rimless' ? bodyPaint : lowerPaint
  switch (s.bridge) {
    case 'saddle':
      bridge = `<path d="M${f(-B / 2)} ${f(yb(0.3))}Q0 ${f(yb(0.3) - 0.3 * H)} ${f(B / 2)} ${f(yb(0.3))}" ${attr(bp, ` stroke-width="${f(Math.max(R * 0.8, 6))}"`)}/>`
      break
    case 'keyhole':
      bridge = `<path d="M${f(-B / 2)} ${f(yb(0.32))}C${f(-B * 0.32)} ${f(yb(0.32) - 0.34 * H)} ${f(B * 0.32)} ${f(yb(0.32) - 0.34 * H)} ${f(B / 2)} ${f(yb(0.32))}" ${attr(bodyPaint, ` stroke-width="${f(Math.max(R * 1.05, 8))}"`)}/>`
      break
    case 'double': {
      const ext = W * 0.18
      bridge =
        `<path d="M${f(-B / 2 - ext)} ${f(yb(0.14))}Q0 ${f(yb(0.14) - 0.2 * H)} ${f(B / 2 + ext)} ${f(yb(0.14))}" ${attr(bp, ` stroke-width="${f(Math.max(R * 0.9, 6))}"`)}/>` +
        `<path d="M${f(-B / 2)} ${f(yb(0.4))}Q0 ${f(yb(0.4) - 0.14 * H)} ${f(B / 2)} ${f(yb(0.4))}" ${attr(bp, ` stroke-width="${f(Math.max(R * 0.7, 5))}"`)}/>`
      break
    }
    case 'high':
      bridge = `<path d="M${f(-B / 2)} ${f(yb(0.12))}Q0 ${f(yb(0.12) - 0.1 * H)} ${f(B / 2)} ${f(yb(0.12))}" ${attr(bodyPaint, ` stroke-width="${f(Math.max(R * 1.2, 7))}"`)}/>`
      break
  }

  // Soft highlight along the top of glossy / translucent rims.
  let gloss = ''
  if (bodyPaint.gloss && s.rim !== 'rimless' && R >= 12) {
    const cut = y0 + 0.5 * H
    gloss =
      `<clipPath id="${id}gc"><rect x="${f(-W * 3)}" y="${f(-H * 2)}" width="${f(W * 6)}" height="${f(cut + H * 2)}"/></clipPath>` +
      `<g clip-path="url(#${id}gc)" transform="translate(0 ${f(-R * 0.22)})"><path d="${dL}${dR}" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="${f(Math.max(2.5, R * 0.2))}" stroke-linecap="round"/></g>`
  }

  // Rimless mounting hardware.
  const hardware =
    s.rim === 'rimless'
      ? [hingeL, hingeR, { x: -B / 2, y: yb(0.3) }, { x: B / 2, y: yb(0.3) }]
          .map((p) => `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(R * 1.6)}" fill="${bodyPaint.fill}"/>`)
          .join('')
      : ''

  // ---- assemble ----
  const pad = FRAME_RENDER.padding
  const totalHalf = FRAME_RENDER.frontWidth / 2 + stub + pad
  const minY = frameTop - pad
  const vbW = totalHalf * 2
  const vbH = frameBottom + pad - minY
  const defs = `<defs>${bodyPaint.defs}${defsExtra}${tintDefs}</defs>`
  const body = `${temples}${lenses}${rims}${brow}${bridge}${gloss}${hardware}`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(-totalHalf)} ${f(minY)} ${f(vbW)} ${f(vbH)}" width="${f(vbW)}" height="${f(vbH)}" ` +
    `stroke-miterlimit="4">${defs}${body}</svg>`

  return {
    svg,
    width: vbW,
    height: vbH,
    frontMm: frameFrontMm(s),
    viewBox: { x: -totalHalf, y: minY, w: vbW, h: vbH },
    frontBox: { x: -FRAME_RENDER.frontWidth / 2, y: frameTop, w: FRAME_RENDER.frontWidth, h: frameBottom - frameTop },
    anchors: {
      leftLensCenter: { x: cxL, y: 0 },
      rightLensCenter: { x: -cxL, y: 0 },
      bridge: bridgeAnchor,
      leftHinge: hingeL,
      rightHinge: hingeR,
    },
  }
}
