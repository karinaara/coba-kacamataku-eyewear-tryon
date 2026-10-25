import { QUALITY } from '../core/config/quality'
import { CAPTURE } from '../core/config/capture'

export type Source = HTMLVideoElement | HTMLCanvasElement | ImageBitmap

export function sourceSize(src: Source): { width: number; height: number } {
  if (src instanceof HTMLVideoElement) return { width: src.videoWidth, height: src.videoHeight }
  return { width: src.width, height: src.height }
}

let scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null

/** Downscaled RGBA pixels of a frame, for the pixel-based quality checks. */
export function grabPixels(src: Source, width = QUALITY.analysisWidth): ImageData {
  const { width: sw, height: sh } = sourceSize(src)
  const w = Math.min(width, sw)
  const h = Math.max(1, Math.round((sh * w) / sw))
  if (!scratch) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('2D canvas is not available')
    scratch = { canvas, ctx }
  }
  scratch.canvas.width = w
  scratch.canvas.height = h
  scratch.ctx.drawImage(src, 0, 0, w, h)
  return scratch.ctx.getImageData(0, 0, w, h)
}

/** A full-resolution (capped) copy of the frame. Kept in memory only; never uploaded or stored. */
export function snapshot(src: Source, maxWidth = CAPTURE.maxSnapshotWidth): HTMLCanvasElement {
  const { width: sw, height: sh } = sourceSize(src)
  const w = Math.min(maxWidth, sw)
  const h = Math.max(1, Math.round((sh * w) / sw))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is not available')
  ctx.drawImage(src, 0, 0, w, h)
  return canvas
}
