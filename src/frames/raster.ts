// Rasterizes generated SVG frames to bitmaps and keeps a small LRU cache of them (browser only).
//
// 5,000+ frames as bitmaps would not fit in memory, so only the most recently used few are kept.
// Drawing a cached bitmap is a single drawImage call.

import { FRAME_RENDER } from '../core/config/frames'
import { renderSpec, visualKey, type FrameSpec } from './catalog'
import type { GeneratedFrame } from './generate'

export interface FrameBitmap {
  bitmap: ImageBitmap
  frame: GeneratedFrame
}

const cache = new Map<string, FrameBitmap>() // insertion order doubles as recency order
const inflight = new Map<string, Promise<FrameBitmap>>()

/** Returns the cached bitmap without any async work, or undefined if it has to be rasterized first. */
export function peekFrame(spec: FrameSpec): FrameBitmap | undefined {
  const key = visualKey(spec)
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit) // mark as most recently used
  }
  return hit
}

async function rasterize(frame: GeneratedFrame): Promise<ImageBitmap> {
  const img = new Image()
  img.decoding = 'async'
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(frame.svg)}`
  await img.decode()
  const w = FRAME_RENDER.rasterWidth
  const h = Math.max(1, Math.round((w * frame.height) / frame.width))
  return createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
}

/** Rasterizes (once) and caches. Rejects if the SVG cannot be decoded. */
export function getFrame(spec: FrameSpec): Promise<FrameBitmap> {
  const key = visualKey(spec)
  const hit = peekFrame(spec)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(key)
  if (pending) return pending

  const frame = renderSpec(spec)
  const p = rasterize(frame)
    .then((bitmap) => {
      const entry = { bitmap, frame }
      cache.set(key, entry)
      while (cache.size > FRAME_RENDER.cacheSize) {
        const oldest = cache.keys().next().value as string
        cache.get(oldest)?.bitmap.close()
        cache.delete(oldest)
      }
      return entry
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export const cacheStats = () => ({ size: cache.size, limit: FRAME_RENDER.cacheSize })
