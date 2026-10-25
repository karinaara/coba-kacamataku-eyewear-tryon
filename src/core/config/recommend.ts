// [tune] Recommendation engine settings (brief section 8). Every number is a STARTING VALUE.
// The shape x frame matrix is from the brief ("commonly cited styling guidance"); the rest are guesses.
// None of this has been validated against real people's ratings (that is M8).

import type { FaceShape } from './faceShapes'
import type { FrameFamily } from './frames'

export const RECOMMEND = {
  // score = shape * wShape + color * wColor + fit * wFit + pref * wPref
  weights: { shape: 0.4, color: 0.3, fit: 0.2, pref: 0.1 },

  // Extra shape rules, each small and named so "Why this?" can say which one fired.
  rules: {
    // Taller-than-average lenses help an oblong (long) face: up to +strength x P(oblong).
    tallness: { strength: 0.1, fullAt: 0.15 },
    // Wide, bottom-heavy lenses fight a heart-shaped (narrow chin) face: up to -strength x P(heart).
    bottomHeavy: { strength: 0.08, threshold: 0.95 },
  },

  color: {
    // How well a frame's temperature suits the undertone: rows = undertone, columns = frame color temperature.
    temperature: {
      warm: { warm: 1, neutral: 0.8, cool: 0.35 },
      cool: { cool: 1, neutral: 0.8, warm: 0.35 },
      neutral: { warm: 0.8, cool: 0.8, neutral: 1 },
    },
    // Metals and neutrals are safe choices: a small bonus on the temperature part.
    safeBonus: 0.05,
    // When the undertone label is shaky (close to a band edge), this share comes from the neighbouring label.
    borderlineHedge: 0.4,
    // Frame lightness vs skin lightness (L*): invisible below minDeltaL, clearly visible from goodDeltaL.
    minDeltaL: 6,
    goodDeltaL: 22,
    // Translucent frames show through, so their contrast counts for this share.
    translucentVisibility: 0.5,
    // Highest frame chroma that still suits each contrast level, and how fast the score falls beyond it.
    chromaIdealMax: { low: 28, medium: 45, high: 200 },
    chromaFalloff: 30,
    chromaFloor: 0.4,
    // Harmony with hair and eyes: baseline, with a bonus for echoing them (small color distance)
    // or contrasting with the hair cleanly (large lightness gap).
    harmonyBase: 0.5,
    echoNear: 12,
    echoFar: 35,
    cleanContrastFrom: 20,
    cleanContrastTo: 45,
    cleanContrastValue: 0.85,
    weights: { temperature: 0.45, depth: 0.25, chroma: 0.15, harmony: 0.15 },
    // Low confidence flattens every color toward this neutral score, so the palette stays broad.
    neutralScore: 0.55,
    confidenceFloor: 0.25,
  },

  fit: {
    // Frame width / cheekbone width. Frames are measured at the hinges and the face at the cheek
    // outline, which is wider than the temples, so the ideal sits a little under 1.
    idealRatio: 0.96,
    tolerance: 0.06,
    // Beyond the tolerance the score falls linearly over this much more, down to the floor.
    falloff: 0.18,
    floor: 0.25,
    // Lens center distance minus the wearer's pupil distance (mm) that is considered well aligned.
    pdOkMm: [-2, 9] as const,
    pdFalloffMm: 8,
    pdFloor: 0.5,
    weights: { width: 0.75, pupil: 0.25 },
    // Used when the face could not be measured in millimetres.
    unknownScore: 0.6,
    // Size choice prefers M on a tie by this much.
    mBias: 0.001,
  },

  pref: {
    // How much a chosen Minimal / Classic / Bold chip moves the style and color preference.
    chipStrength: 0.8,
    // Each like / dislike tap.
    likeStep: 0.2,
    colorStep: 0.15,
    // Likes on other styles of the same family count for this share.
    familySpill: 0.4,
    // Totals are capped, so a few taps never decide everything.
    styleCap: 0.4,
    colorCap: 0.3,
    // In a (style, color) pair the style preference counts this much, the color the rest.
    styleShare: 0.7,
  },

  lists: {
    topStyles: 3,
    topColors: 5,
    avoidCount: 3,
    // An item is only listed under "might not suit you" if it also scores below this.
    avoidStyleBelow: 0.62,
    avoidColorBelow: 0.5,
  },
}

/** Rows are frame families, columns face shapes. From the brief's starter matrix (0 to 1). */
export const COMPAT: Record<FrameFamily, Record<FaceShape, number>> = {
  round: { oval: 0.8, round: 0.3, square: 0.9, oblong: 0.5, heart: 0.7, diamond: 0.7 },
  oval: { oval: 1.0, round: 0.6, square: 0.9, oblong: 0.6, heart: 0.8, diamond: 0.9 },
  square: { oval: 0.8, round: 0.9, square: 0.3, oblong: 0.7, heart: 0.6, diamond: 0.6 },
  rectangle: { oval: 0.8, round: 0.9, square: 0.4, oblong: 0.5, heart: 0.7, diamond: 0.5 },
  wayfarer: { oval: 0.9, round: 0.8, square: 0.7, oblong: 0.8, heart: 0.6, diamond: 0.6 },
  browline: { oval: 0.8, round: 0.8, square: 0.7, oblong: 0.6, heart: 0.5, diamond: 0.8 },
  aviator: { oval: 0.9, round: 0.6, square: 0.8, oblong: 0.6, heart: 0.8, diamond: 0.7 },
  'cat-eye': { oval: 0.8, round: 0.5, square: 0.7, oblong: 0.4, heart: 0.7, diamond: 0.9 },
  geometric: { oval: 0.7, round: 0.8, square: 0.5, oblong: 0.6, heart: 0.6, diamond: 0.7 },
  oversized: { oval: 0.8, round: 0.6, square: 0.6, oblong: 1.0, heart: 0.6, diamond: 0.6 },
}

export const FAMILY_LABEL: Record<FrameFamily, string> = {
  round: 'Round',
  oval: 'Oval',
  square: 'Square',
  rectangle: 'Rectangular',
  wayfarer: 'Wayfarer-style',
  browline: 'Browline',
  aviator: 'Aviator',
  'cat-eye': 'Cat-eye',
  geometric: 'Geometric',
  oversized: 'Oversized',
}

/** One plain sentence on what a family does for a face, used in the reasons. */
export const FAMILY_NOTE: Record<FrameFamily, string> = {
  round: 'curved lines soften sharp angles',
  oval: 'a balanced shape that works with most faces',
  square: 'strong angles add definition',
  rectangle: 'straight lines and angles add definition',
  wayfarer: 'a bold top line that frames the face',
  browline: 'a strong brow line lifts and frames the eyes',
  aviator: 'a wide, curved shape that balances the forehead',
  'cat-eye': 'lifted outer corners draw the eye up and out',
  geometric: 'crisp facets add contrast to soft features',
  oversized: 'large lenses add presence and balance a longer face',
}

export const STYLE_CHIPS = ['minimal', 'classic', 'bold'] as const
export type StyleChip = (typeof STYLE_CHIPS)[number]

/** How much each style reads as minimal, classic or bold (0 to 1). */
export const STYLE_TAGS: Record<string, Record<StyleChip, number>> = {
  round: { minimal: 0.7, classic: 0.6, bold: 0.2 },
  panto: { minimal: 0.5, classic: 0.8, bold: 0.2 },
  oval: { minimal: 0.8, classic: 0.7, bold: 0.1 },
  rectangle: { minimal: 0.7, classic: 0.7, bold: 0.2 },
  square: { minimal: 0.3, classic: 0.6, bold: 0.6 },
  wayfarer: { minimal: 0.2, classic: 0.9, bold: 0.5 },
  browline: { minimal: 0.2, classic: 0.9, bold: 0.4 },
  aviator: { minimal: 0.4, classic: 0.9, bold: 0.3 },
  'cat-eye': { minimal: 0.1, classic: 0.4, bold: 0.9 },
  butterfly: { minimal: 0, classic: 0.2, bold: 1 },
  hexagon: { minimal: 0.3, classic: 0.3, bold: 0.8 },
  octagon: { minimal: 0.3, classic: 0.3, bold: 0.8 },
  'half-rim': { minimal: 0.8, classic: 0.7, bold: 0.1 },
  rimless: { minimal: 1, classic: 0.4, bold: 0 },
  'shield-lite': { minimal: 0.1, classic: 0.1, bold: 0.9 },
  wellington: { minimal: 0.2, classic: 0.8, bold: 0.6 },
}
