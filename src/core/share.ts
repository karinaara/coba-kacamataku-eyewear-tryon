// Share card content and layout (no drawing). Pure, so it can be tested without a canvas.

import { NICKNAME, SHARE } from './config/share'
import { SHAPE_LABEL } from './explain'
import type { FaceShapeResult } from './faceShape'

const pct = (v: number) => `${Math.round(v * 100)}%`

/** "The Classic Oval", or "The Oval-Round Blend" when the face sits between two shapes. */
export function nicknameFor(shape: FaceShapeResult): string {
  return shape.between ? `The ${SHAPE_LABEL[shape.primary]}-${SHAPE_LABEL[shape.secondary]} Blend` : NICKNAME[shape.primary]
}

/** The line under the nickname. */
export function shapeLine(shape: FaceShapeResult): string {
  const p = SHAPE_LABEL[shape.primary]
  const s = SHAPE_LABEL[shape.secondary]
  return shape.between
    ? `${p} ${pct(shape.probabilities[shape.primary])} · ${s} ${pct(shape.probabilities[shape.secondary])}`
    : `${p} face ${pct(shape.probabilities[shape.primary])} · a bit ${s.toLowerCase()}`
}

export interface CardFrame {
  /** Style name, such as "Wayfarer". */
  name: string
  /** Color name, such as "Havana Tortoise". */
  color: string
}

/** Text description of the picture, for screen readers (the card is an image). */
export function shareAltText(shape: FaceShapeResult, frames: readonly CardFrame[], includesPhoto: boolean): string {
  return [
    `Share card from coba-kacamataku: ${nicknameFor(shape)}.`,
    `${shapeLine(shape)}.`,
    frames.length ? `Top frames for this face: ${frames.map((f, i) => `${i + 1}, ${f.name} in ${f.color}`).join('; ')}.` : '',
    includesPhoto ? 'The picture shows the person wearing the selected glasses.' : 'The picture shows the selected glasses on their own.',
    'Made on the device, a style suggestion and not a rule.',
  ]
    .filter(Boolean)
    .join(' ')
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ShareLayout {
  brand: { x: number; y: number }
  photo: Rect
  nickname: { x: number; y: number; maxWidth: number }
  shapeLine: { x: number; y: number }
  heading: { x: number; y: number }
  cards: Rect[]
  footer: { x: number; y: number }
}

/** Where everything goes on the card. Three cards share the width evenly. */
export function shareLayout(cardCount = 3): ShareLayout {
  const { width, height, margin } = SHARE
  const inner = width - 2 * margin
  const photo: Rect = { x: margin, y: SHARE.photo.y, w: inner, h: inner }
  const nickname = { x: margin, y: photo.y + photo.h + SHARE.nickname.gapBelowPhoto, maxWidth: inner }
  const shapeY = nickname.y + SHARE.shapeLine.gapBelowNickname + SHARE.shapeLine.size
  const headingY = shapeY + SHARE.topHeading.gapBelowShapeLine
  const cardsY = headingY + SHARE.cards.gapBelowHeading
  const cardW = (inner - SHARE.cards.gap * (cardCount - 1)) / cardCount
  return {
    brand: { x: margin, y: SHARE.brand.y },
    photo,
    nickname,
    shapeLine: { x: margin, y: shapeY },
    heading: { x: margin, y: headingY },
    cards: Array.from({ length: cardCount }, (_, i) => ({ x: margin + i * (cardW + SHARE.cards.gap), y: cardsY, w: cardW, h: SHARE.cards.height })),
    footer: { x: margin, y: height - SHARE.footer.bottomMargin },
  }
}

export interface Crop {
  sx: number
  sy: number
  side: number
}

/**
 * The square part of the picture to show: centered on the eyes, `cropFaceWidths` cheekbone widths across,
 * moved to stay inside the picture, and never larger than the picture.
 */
export function photoCrop(imageW: number, imageH: number, eyeCenter: { x: number; y: number }, cheekWidthPx: number): Crop {
  const side = Math.min(imageW, imageH, Math.max(cheekWidthPx * SHARE.cropFaceWidths, 1))
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  return {
    side,
    sx: clamp(eyeCenter.x - side / 2, 0, imageW - side),
    // The eyes sit a little above the middle of a head-and-shoulders crop.
    sy: clamp(eyeCenter.y - side * 0.45, 0, imageH - side),
  }
}
