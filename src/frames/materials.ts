// Materials and finishes as SVG paints (brief section 6.2). Pure string builders, deterministic.

import { COLOR_BY_ID, type FrameColor } from '../core/config/colors'

// ---- small color helpers on hex strings ----

const toRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const toHex = (rgb: readonly number[]) =>
  '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')

/** Linear mix in sRGB: t = 0 gives `a`, t = 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a)
  const y = toRgb(b)
  return toHex(x.map((v, i) => v + ((y[i] as number) - v) * t))
}
export const lighten = (hex: string, t: number) => mix(hex, '#ffffff', t)
export const darken = (hex: string, t: number) => mix(hex, '#000000', t)

/** FNV-1a string hash, used to seed the tortoise pattern so a color always looks the same. */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Small seeded PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const n1 = (v: number) => (Math.round(v * 10) / 10).toString()

// ---- paints ----

export interface Paint {
  /** `<defs>` content (gradients, patterns) this paint needs. */
  defs: string
  /** Value for `fill` / `stroke`. */
  fill: string
  /** Opacity for the shapes painted with it. */
  opacity: number
  /** Darker edge color for translucent plastics, else null. */
  outline: string | null
  /** Draws a soft highlight along the top of the rim. */
  gloss: boolean
}

function tortoisePattern(id: string, base: string, seedKey: string): string {
  const rand = seededRandom(hashString(seedKey))
  const dark = darken(base, 0.55)
  const mid = darken(base, 0.25)
  const amber = mix(base, '#E0A040', 0.55)
  const palette = [dark, mid, amber, base, dark]
  const SIZE = 240
  let blobs = ''
  for (let i = 0; i < 22; i++) {
    const cx = rand() * SIZE
    const cy = rand() * SIZE
    const rx = 14 + rand() * 40
    const ry = 9 + rand() * 24
    const rot = rand() * 180
    const fill = palette[Math.floor(rand() * palette.length)] as string
    const op = 0.55 + rand() * 0.35
    // Draw each blob at wrapped positions too, so the tile repeats without seams.
    for (const [dx, dy] of [[0, 0], [SIZE, 0], [-SIZE, 0], [0, SIZE], [0, -SIZE]] as const) {
      blobs += `<ellipse cx="${n1(cx + dx)}" cy="${n1(cy + dy)}" rx="${n1(rx)}" ry="${n1(ry)}" transform="rotate(${n1(rot)} ${n1(cx + dx)} ${n1(cy + dy)})" fill="${fill}" fill-opacity="${op.toFixed(2)}"/>`
    }
  }
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${base}"/>${blobs}</pattern>`
}

/** Light -> dark -> light, running top to bottom across the frame. */
function metalGradient(id: string, hex: string, y0: number, y1: number): string {
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${n1(y0)}" x2="0" y2="${n1(y1)}">` +
    `<stop offset="0" stop-color="${lighten(hex, 0.5)}"/>` +
    `<stop offset="0.5" stop-color="${darken(hex, 0.28)}"/>` +
    `<stop offset="1" stop-color="${lighten(hex, 0.38)}"/>` +
    `</linearGradient>`
  )
}

/** Builds the paint for a color. `id` must be unique within the SVG; y0/y1 bound the frame vertically. */
export function paintFor(color: FrameColor, id: string, y0: number, y1: number): Paint {
  switch (color.material) {
    case 'glossy':
      return { defs: '', fill: color.hex, opacity: 1, outline: null, gloss: true }
    case 'matte':
      return { defs: '', fill: color.hex, opacity: 1, outline: null, gloss: false }
    case 'tortoise':
      return { defs: tortoisePattern(id, color.hex, color.id), fill: `url(#${id})`, opacity: 1, outline: null, gloss: true }
    case 'translucent':
      return { defs: '', fill: color.hex, opacity: 0.62, outline: darken(color.hex, 0.4), gloss: true }
    case 'metal':
      return { defs: metalGradient(id, color.hex, y0, y1), fill: `url(#${id})`, opacity: 1, outline: null, gloss: false }
  }
}

/** The metal that sits best with a color: warm colors get gold, the rest silver. Used by two-tone frames. */
export function pairedMetal(color: FrameColor): FrameColor {
  if (color.material === 'metal') return color
  const id = color.temperature === 'warm' ? 'gold' : 'silver'
  const metal = COLOR_BY_ID.get(id)
  if (!metal) throw new Error(`Missing palette color ${id}`)
  return metal
}
