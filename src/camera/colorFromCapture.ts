import { COLOR } from '../core/config/color'
import { analyzeColor, type AnalyzeColorOptions, type ColorProfile } from '../core/colorProfile'
import type { ImageLike } from '../core/roi'
import type { CaptureResult } from './captureResult'
import { grabPixels } from './frameSampler'

// Reading the picture's pixels is the slow part, so it is done once per capture.
const pixels = new WeakMap<CaptureResult, ImageLike>()

/** Color profile for a capture. Re-running with other options (answers, head covering) is cheap. */
export function profileFromCapture(result: CaptureResult, opts: AnalyzeColorOptions = {}): ColorProfile | null {
  let image = pixels.get(result)
  if (!image) {
    image = grabPixels(result.image, COLOR.sampleWidth)
    pixels.set(result, image)
  }
  return analyzeColor({ landmarks: result.landmarks, image, quality: result.quality }, opts)
}
