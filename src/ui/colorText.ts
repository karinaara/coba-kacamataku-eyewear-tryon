import type { DepthId } from '../core/config/color'
import type { ColorProfile, ConfidenceLevel, Contrast, Undertone } from '../core/colorProfile'

export const DEPTH_LABEL: Record<DepthId, string> = {
  'very-light': 'Very light',
  light: 'Light',
  intermediate: 'Medium',
  tan: 'Tan',
  brown: 'Brown',
  dark: 'Deep',
}

export const UNDERTONE_LABEL: Record<Undertone, string> = { cool: 'Cool', neutral: 'Neutral', warm: 'Warm' }
export const CONTRAST_LABEL: Record<Contrast, string> = { low: 'Low contrast', medium: 'Medium contrast', high: 'High contrast' }

export const CONFIDENCE_TEXT: Record<ConfidenceLevel, string> = {
  High: 'We are fairly confident about this.',
  Medium: 'Reasonably sure. Treat this as a guide, not a fact.',
  Low: 'Not very sure. This photo makes your skin color hard to read.',
}

/** "Cool", or "Cool, close to neutral" when the label sits near a band edge. */
export const undertoneText = (p: ColorProfile) =>
  p.undertoneNear ? `${UNDERTONE_LABEL[p.undertone]}, close to ${p.undertoneNear}` : UNDERTONE_LABEL[p.undertone]

/** "Cool undertone", or "Cool undertone, close to neutral" when the label sits near a band edge. */
export const undertoneSentence = (p: ColorProfile) =>
  `${UNDERTONE_LABEL[p.undertone]} undertone${p.undertoneNear ? `, close to ${p.undertoneNear}` : ''}`

export const contrastText = (p: ColorProfile) =>
  p.contrast === null
    ? 'Not enough to tell'
    : `${CONTRAST_LABEL[p.contrast]}${p.contrastBasis === 'eyes' ? ' (from your eyes only)' : ''}`

export const pctText = (v: number) => `${Math.round(v * 100)}%`
