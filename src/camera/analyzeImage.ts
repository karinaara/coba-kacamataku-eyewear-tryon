import { getLandmarker } from './landmarker'
import { grabPixels, snapshot } from './frameSampler'
import type { CaptureResult } from './captureResult'
import { evaluateQuality } from '../core/quality'
import { poseFromMatrix } from '../core/pose'

export class NoFaceError extends Error {
  constructor() {
    super('No face found in this photo.')
  }
}

/**
 * Upload path: one photo goes through the same landmark + quality pipeline as a camera capture.
 * The quality gate only warns here (the user cannot re-shoot). The photo stays in memory.
 */
export async function analyzeImageFile(file: File): Promise<CaptureResult> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const image = snapshot(bitmap)
    const { landmarker } = await getLandmarker('IMAGE')
    const res = landmarker.detect(image)
    const landmarks = res.faceLandmarks[0]
    if (!landmarks) throw new NoFaceError()
    const matrix = res.facialTransformationMatrixes?.[0]?.data ?? null
    const quality = evaluateQuality({ landmarks, matrix, image: grabPixels(image) }, 'upload')
    return {
      source: 'upload',
      landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
      pose: matrix ? poseFromMatrix(matrix) : null,
      image,
      framesKept: 1,
      framesRejected: 0,
      quality,
    }
  } finally {
    bitmap.close()
  }
}
