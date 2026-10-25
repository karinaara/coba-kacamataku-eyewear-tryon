import type { FrameColor } from '../core/config/colors'
import { darken, lighten, mix } from '../frames/materials'

/** CSS background that hints at the finish: metals shine, tortoise is blotchy, translucents are see-through. */
export function swatchBackground(c: FrameColor): string {
  switch (c.material) {
    case 'metal':
      return `linear-gradient(135deg, ${lighten(c.hex, 0.55)} 0%, ${c.hex} 40%, ${darken(c.hex, 0.3)} 70%, ${lighten(c.hex, 0.4)} 100%)`
    case 'tortoise':
      return `radial-gradient(circle at 28% 30%, ${mix(c.hex, '#E0A040', 0.6)} 0 22%, transparent 24%), radial-gradient(circle at 70% 62%, ${darken(c.hex, 0.55)} 0 28%, transparent 30%), radial-gradient(circle at 60% 20%, ${darken(c.hex, 0.25)} 0 18%, transparent 20%), ${c.hex}`
    case 'translucent':
      return `linear-gradient(135deg, ${c.hex}cc, ${c.hex}66), repeating-conic-gradient(#d1d5db 0% 25%, #ffffff 0% 50%) 0 0 / 10px 10px`
    case 'matte':
      return c.hex
    case 'glossy':
      return `linear-gradient(160deg, ${lighten(c.hex, 0.28)} 0%, ${c.hex} 45%)`
  }
}

/** A readable tick color on top of a swatch. */
export const tickColor = (c: FrameColor) => (c.lightness > 62 ? '#111827' : '#ffffff')
