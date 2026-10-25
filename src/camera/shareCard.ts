// Draws the share card on a canvas, on this device. Nothing is sent anywhere; the picture is saved only if
// the user taps Save or Share. Browser only (canvas).

import { computeFit, fitPointsFromLandmarks } from '../core/fit'
import { SHARE } from '../core/config/share'
import type { Point3 } from '../core/landmarks'
import { photoCrop, shareLayout, type Rect } from '../core/share'
import type { FrameBitmap } from '../frames/raster'
import type { CaptureResult } from './captureResult'
import { drawFrame } from './tryonDraw'

export interface CardFrame {
  name: string
  color: string
  entry: FrameBitmap | null
}

export interface ShareCardInput {
  result: CaptureResult
  /** The frame the user has on, and its size factor. */
  selected: { entry: FrameBitmap; sizeFactor: number } | null
  nickname: string
  shapeLine: string
  top: CardFrame[]
  /** Draw the user's photo. If false the frame is shown on its own, so no face appears on the card. */
  includePhoto: boolean
}

const { colors: C, fonts: F } = SHARE

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, radius)
}

/** Largest font size (from max down to min) at which `text` fits in `maxWidth`. */
function fitSize(ctx: CanvasRenderingContext2D, text: string, weight: number, family: string, max: number, min: number, maxWidth: number): number {
  for (let size = max; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`
    if (ctx.measureText(text).width <= maxWidth) return size
  }
  return min
}

/** Draws the picture with the chosen frame on it (mirrored for camera captures, like a selfie). */
function photoWithFrame(result: CaptureResult, selected: ShareCardInput['selected']): { canvas: HTMLCanvasElement; eye: { x: number; y: number }; cheekPx: number } {
  const { image } = result
  const W = image.width
  const H = image.height
  const mirror = result.source === 'camera'
  const work = document.createElement('canvas')
  work.width = W
  work.height = H
  const ctx = work.getContext('2d')
  if (!ctx) throw new Error('2D canvas is not available')
  if (mirror) {
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(image, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  const landmarks: Point3[] = mirror ? result.landmarks.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })) : result.landmarks
  const pts = fitPointsFromLandmarks(landmarks, W, H)
  if (selected) {
    const { entry, sizeFactor } = selected
    drawFrame(ctx, entry, computeFit(pts, result.pose?.yaw ?? 0, entry.frame.frontBox.w, entry.frame.frontBox.h, sizeFactor, entry.frame.frontMm))
  }
  return {
    canvas: work,
    eye: { x: (pts.irisRight.x + pts.irisLeft.x) / 2, y: (pts.irisRight.y + pts.irisLeft.y) / 2 },
    cheekPx: Math.hypot(pts.cheekLeft.x - pts.cheekRight.x, pts.cheekLeft.y - pts.cheekRight.y),
  }
}

/** Draws a frame bitmap centered in `box`, as large as fits. */
function drawFit(ctx: CanvasRenderingContext2D, entry: FrameBitmap, box: Rect) {
  const s = Math.min(box.w / entry.bitmap.width, box.h / entry.bitmap.height)
  const w = entry.bitmap.width * s
  const h = entry.bitmap.height * s
  ctx.drawImage(entry.bitmap, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h)
}

export async function renderShareCard(input: ShareCardInput): Promise<HTMLCanvasElement> {
  // Canvas text needs the web fonts to be loaded first, or it silently uses a fallback.
  await Promise.all([document.fonts.load(`700 80px ${F.display}`), document.fonts.load(`500 40px ${F.display}`), document.fonts.load(`400 30px ${F.body}`)]).catch(() => undefined)

  const L = shareLayout(input.top.length || 3)
  const canvas = document.createElement('canvas')
  canvas.width = SHARE.width
  canvas.height = SHARE.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is not available')

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, SHARE.width, SHARE.height)
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = C.accent
  ctx.font = `700 ${SHARE.brand.size}px ${F.display}`
  ctx.fillText('coba-kacamataku', L.brand.x, L.brand.y)

  // Photo (or the frame alone).
  ctx.save()
  roundRect(ctx, L.photo, SHARE.photo.radius)
  ctx.clip()
  if (input.includePhoto) {
    const { canvas: work, eye, cheekPx } = photoWithFrame(input.result, input.selected)
    const crop = photoCrop(work.width, work.height, eye, cheekPx)
    ctx.drawImage(work, crop.sx, crop.sy, crop.side, crop.side, L.photo.x, L.photo.y, L.photo.w, L.photo.h)
  } else {
    ctx.fillStyle = C.tint
    ctx.fillRect(L.photo.x, L.photo.y, L.photo.w, L.photo.h)
    if (input.selected) drawFit(ctx, input.selected.entry, { x: L.photo.x + 90, y: L.photo.y + 90, w: L.photo.w - 180, h: L.photo.h - 180 })
  }
  ctx.restore()

  // Nickname and shape line.
  const nick = fitSize(ctx, input.nickname, 700, F.display, SHARE.nickname.maxSize, SHARE.nickname.minSize, L.nickname.maxWidth)
  ctx.fillStyle = C.ink
  ctx.font = `700 ${nick}px ${F.display}`
  ctx.fillText(input.nickname, L.nickname.x, L.nickname.y)
  ctx.fillStyle = C.muted
  ctx.font = `500 ${SHARE.shapeLine.size}px ${F.display}`
  ctx.fillText(input.shapeLine, L.shapeLine.x, L.shapeLine.y)

  // Top frames.
  ctx.fillStyle = C.accent
  ctx.font = `700 ${SHARE.topHeading.size}px ${F.display}`
  ctx.fillText('Top frames for me', L.heading.x, L.heading.y)
  input.top.forEach((f, i) => {
    const r = L.cards[i] as Rect
    ctx.fillStyle = C.panel
    roundRect(ctx, r, SHARE.cards.radius)
    ctx.fill()
    ctx.fillStyle = C.tint
    roundRect(ctx, { x: r.x + 16, y: r.y + 16, w: r.w - 32, h: 190 }, 24)
    ctx.fill()
    if (f.entry) drawFit(ctx, f.entry, { x: r.x + 28, y: r.y + 28, w: r.w - 56, h: 166 })
    ctx.fillStyle = C.ink
    ctx.font = `700 34px ${F.display}`
    ctx.fillText(`${i + 1}. ${f.name}`, r.x + 24, r.y + 266, r.w - 48)
    ctx.fillStyle = C.muted
    ctx.font = `400 28px ${F.body}`
    ctx.fillText(f.color, r.x + 24, r.y + 316, r.w - 48)
  })

  ctx.fillStyle = C.muted
  ctx.font = `400 ${SHARE.footer.size}px ${F.body}`
  ctx.fillText('Made on my device. A style suggestion, not a rule.', L.footer.x, L.footer.y)
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image'))), 'image/png'))
}
