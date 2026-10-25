// The frame catalog: every style x color x size x lens tint, enumerated in code. Pure.

import { FRAME_COLORS, COLOR_BY_ID, type FrameColor } from '../core/config/colors'
import { FRAME_STYLES, LENS_TINTS, SIZES, type FrameStyle, type LensTintId, type SizeId } from '../core/config/frames'
import { generateFrame, type GeneratedFrame } from './generate'

export interface FrameSpec {
  styleId: string
  colorId: string
  size: SizeId
  tint: LensTintId
}

const STYLE_BY_ID: ReadonlyMap<string, FrameStyle> = new Map(FRAME_STYLES.map((s) => [s.id, s]))

export const catalogSize = () => FRAME_STYLES.length * FRAME_COLORS.length * SIZES.length * LENS_TINTS.length

/** Number of distinct pictures: size changes the fit, not the drawing. */
export const uniqueVisualCount = () => FRAME_STYLES.length * FRAME_COLORS.length * LENS_TINTS.length

export function* enumerateFrames(): Generator<FrameSpec> {
  for (const style of FRAME_STYLES) {
    for (const color of FRAME_COLORS) {
      for (const size of SIZES) {
        for (const tint of LENS_TINTS) yield { styleId: style.id, colorId: color.id, size: size.id, tint: tint.id }
      }
    }
  }
}

/** One spec per distinct picture (size fixed to M). */
export function* enumerateVisuals(): Generator<FrameSpec> {
  for (const spec of enumerateFrames()) if (spec.size === 'M') yield spec
}

/** Identifies the picture. Size is left out on purpose: S, M and L draw identically. */
export const visualKey = (spec: FrameSpec) => `${spec.styleId}|${spec.colorId}|${spec.tint}`
export const frameKey = (spec: FrameSpec) => `${visualKey(spec)}|${spec.size}`

export function resolveSpec(spec: FrameSpec): { style: FrameStyle; color: FrameColor } {
  const style = STYLE_BY_ID.get(spec.styleId)
  const color = COLOR_BY_ID.get(spec.colorId)
  if (!style || !color) throw new Error(`Unknown frame spec ${frameKey(spec)}`)
  return { style, color }
}

export function renderSpec(spec: FrameSpec): GeneratedFrame {
  const { style, color } = resolveSpec(spec)
  return generateFrame(style, color, spec.tint)
}
