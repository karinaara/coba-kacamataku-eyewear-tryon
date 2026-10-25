// [tune] Frame color palette (brief section 6.3). 28 colors. Lab, chroma, lightness and temperature
// are computed from the hex values below, so they can never drift out of sync with them.

import { rgbToLab, type Lab } from '../color'

export type FrameMaterial = 'glossy' | 'matte' | 'tortoise' | 'translucent' | 'metal'
export type ColorFamily = 'neutral' | 'brown' | 'metal' | 'blue-green' | 'warm-bright' | 'translucent'
export type Temperature = 'warm' | 'cool' | 'neutral'

interface ColorSpec {
  id: string
  name: string
  hex: string
  material: FrameMaterial
  family: ColorFamily
}

const SPECS: ColorSpec[] = [
  // Neutrals
  { id: 'jet-black', name: 'Jet Black', hex: '#111111', material: 'glossy', family: 'neutral' },
  { id: 'charcoal', name: 'Charcoal', hex: '#3A3F47', material: 'matte', family: 'neutral' },
  { id: 'slate', name: 'Slate', hex: '#6B7280', material: 'matte', family: 'neutral' },
  { id: 'crystal-clear', name: 'Crystal Clear', hex: '#E8EEF2', material: 'translucent', family: 'neutral' },
  // Browns
  { id: 'havana-tortoise', name: 'Havana Tortoise', hex: '#7C3F12', material: 'tortoise', family: 'brown' },
  { id: 'chocolate', name: 'Chocolate', hex: '#4A2C1A', material: 'glossy', family: 'brown' },
  { id: 'caramel', name: 'Caramel', hex: '#B9772F', material: 'glossy', family: 'brown' },
  { id: 'honey', name: 'Honey', hex: '#D9A441', material: 'glossy', family: 'brown' },
  // Metals
  { id: 'gold', name: 'Gold', hex: '#C9A227', material: 'metal', family: 'metal' },
  { id: 'rose-gold', name: 'Rose Gold', hex: '#D4A59A', material: 'metal', family: 'metal' },
  { id: 'silver', name: 'Silver', hex: '#BFC5CC', material: 'metal', family: 'metal' },
  { id: 'gunmetal', name: 'Gunmetal', hex: '#4B5563', material: 'metal', family: 'metal' },
  { id: 'bronze', name: 'Bronze', hex: '#8C6A3F', material: 'metal', family: 'metal' },
  // Blues and greens
  { id: 'navy', name: 'Navy', hex: '#1E2A4A', material: 'glossy', family: 'blue-green' },
  { id: 'cobalt', name: 'Cobalt', hex: '#2F4FBF', material: 'glossy', family: 'blue-green' },
  { id: 'teal', name: 'Teal', hex: '#0F766E', material: 'glossy', family: 'blue-green' },
  { id: 'forest', name: 'Forest', hex: '#1F4D3A', material: 'matte', family: 'blue-green' },
  { id: 'olive', name: 'Olive', hex: '#6B6B2A', material: 'matte', family: 'blue-green' },
  { id: 'sage', name: 'Sage', hex: '#9CAF88', material: 'matte', family: 'blue-green' },
  // Warm brights
  { id: 'burgundy', name: 'Burgundy', hex: '#6D1F2F', material: 'glossy', family: 'warm-bright' },
  { id: 'terracotta', name: 'Terracotta', hex: '#B5553A', material: 'matte', family: 'warm-bright' },
  { id: 'mustard', name: 'Mustard', hex: '#D4A017', material: 'glossy', family: 'warm-bright' },
  { id: 'coral', name: 'Coral', hex: '#E8735A', material: 'glossy', family: 'warm-bright' },
  { id: 'blush', name: 'Blush', hex: '#E8B4B8', material: 'matte', family: 'warm-bright' },
  // Translucent tints
  { id: 'clear-pink', name: 'Clear Pink', hex: '#F2CFD3', material: 'translucent', family: 'translucent' },
  { id: 'clear-grey', name: 'Clear Grey', hex: '#CBD2D9', material: 'translucent', family: 'translucent' },
  { id: 'clear-blue', name: 'Clear Blue', hex: '#BBD4E8', material: 'translucent', family: 'translucent' },
  { id: 'clear-amber', name: 'Clear Amber', hex: '#E3B26B', material: 'translucent', family: 'translucent' },
]

/** How a hue is called warm or cool. A wide neutral band, because low-chroma colors are neutral. */
export const TEMPERATURE = {
  neutralChroma: 12,
  warmHueDeg: [28, 115] as const,
}

export interface FrameColor extends ColorSpec {
  lab: Lab
  lightness: number
  chroma: number
  hueDeg: number
  temperature: Temperature
}

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

export function describeColor(spec: ColorSpec): FrameColor {
  const lab = rgbToLab(...hexToRgb(spec.hex))
  const chroma = Math.hypot(lab[1], lab[2])
  const hueDeg = ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360
  const [lo, hi] = TEMPERATURE.warmHueDeg
  const temperature: Temperature = chroma < TEMPERATURE.neutralChroma ? 'neutral' : hueDeg >= lo && hueDeg <= hi ? 'warm' : 'cool'
  return { ...spec, lab, lightness: lab[0], chroma, hueDeg, temperature }
}

export const FRAME_COLORS: FrameColor[] = SPECS.map(describeColor)

export const COLOR_BY_ID: ReadonlyMap<string, FrameColor> = new Map(FRAME_COLORS.map((c) => [c.id, c]))
