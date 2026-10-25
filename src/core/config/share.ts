// [tune] Share card (brief section 12 / M9): a 1080 x 1920 image made on the device, saved only when the user taps Save.
// Colors follow the approved mockup (dark surface #0F172A, teal accent).

import type { FaceShape } from './faceShapes'

/** A playful, positive name per face shape. Copy only: it does not change any result. */
export const NICKNAME: Record<FaceShape, string> = {
  oval: 'The Classic Oval',
  round: 'The Friendly Round',
  square: 'The Bold Square',
  oblong: 'The Graceful Oblong',
  heart: 'The Sweet Heart',
  diamond: 'The Rare Diamond',
}

export const SHARE = {
  width: 1080,
  height: 1920,
  margin: 72,
  colors: {
    bg: '#0F172A',
    ink: '#FFFFFF',
    muted: '#94A3B8',
    accent: '#5EEAD4',
    panel: '#1E293B',
    tint: '#D5EAE7',
  },
  fonts: {
    display: '"Space Grotesk Variable", "Space Grotesk", sans-serif',
    body: '"Inter Variable", Inter, system-ui, sans-serif',
  },
  brand: { y: 112, size: 44 },
  photo: { y: 176, radius: 56 },
  // Nickname text shrinks from max to min until it fits the width.
  nickname: { gapBelowPhoto: 140, maxSize: 96, minSize: 52 },
  shapeLine: { gapBelowNickname: 36, size: 44 },
  topHeading: { gapBelowShapeLine: 96, size: 38 },
  cards: { gapBelowHeading: 28, height: 360, gap: 24, radius: 36 },
  footer: { bottomMargin: 56, size: 30 },
  // The photo is cropped to a square this many cheekbone widths across, centered on the eyes.
  cropFaceWidths: 2.5,
}
