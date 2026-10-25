import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { LANDMARKER } from '../core/config/landmarker'

export type Delegate = 'GPU' | 'CPU'
export type RunMode = 'VIDEO' | 'IMAGE'

export interface LoadedLandmarker {
  landmarker: FaceLandmarker
  delegate: Delegate
}

/** Turns a path from config into a URL under the site's base, so a subpath deploy works. */
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`

async function create(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  delegate: Delegate,
  runningMode: RunMode,
) {
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: assetUrl(LANDMARKER.modelPath), delegate },
    runningMode,
    numFaces: LANDMARKER.numFaces,
    minFaceDetectionConfidence: LANDMARKER.minFaceDetectionConfidence,
    minFacePresenceConfidence: LANDMARKER.minFacePresenceConfidence,
    minTrackingConfidence: LANDMARKER.minTrackingConfidence,
    outputFacialTransformationMatrixes: LANDMARKER.outputFacialTransformationMatrixes,
    outputFaceBlendshapes: LANDMARKER.outputFaceBlendshapes,
  })
}

/** Loads a FaceLandmarker from local files. Tries the GPU delegate, falls back to CPU. */
export async function loadLandmarker(runningMode: RunMode = 'VIDEO'): Promise<LoadedLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(assetUrl(LANDMARKER.wasmPath))
  try {
    return { landmarker: await create(vision, 'GPU', runningMode), delegate: 'GPU' }
  } catch (gpuError) {
    console.warn('[landmarker] GPU delegate failed, falling back to CPU', gpuError)
    return { landmarker: await create(vision, 'CPU', runningMode), delegate: 'CPU' }
  }
}

// One landmarker per running mode, created lazily and shared by every screen.
const cache = new Map<RunMode, Promise<LoadedLandmarker>>()

export function getLandmarker(mode: RunMode): Promise<LoadedLandmarker> {
  let p = cache.get(mode)
  if (!p) {
    p = loadLandmarker(mode)
    cache.set(mode, p)
    p.catch(() => cache.delete(mode)) // allow a retry after a failure
  }
  return p
}

interface ConnectionInfo {
  saveData?: boolean
  effectiveType?: string
}

/** True when it is polite to download about 7 MB in the background: not on data saver, not on a slow link. */
export function canPrefetch(): boolean {
  const c = (navigator as Navigator & { connection?: ConnectionInfo }).connection
  if (c?.saveData) return false
  return !(c?.effectiveType && ['slow-2g', '2g', '3g'].includes(c.effectiveType))
}

let prefetched = false

/**
 * Warms the cache with the face model and the one WebAssembly runtime this browser will use, while the
 * user is still on the landing screen, so tapping "Scan" does not wait for a 7 MB download.
 * Safe to call more than once; does nothing on data saver or a slow connection.
 */
export async function prefetchModel(): Promise<void> {
  if (prefetched || !canPrefetch()) return
  prefetched = true
  const simd = await FilesetResolver.isSimdSupported().catch(() => true)
  const wasm = `${LANDMARKER.wasmPath}/vision_wasm${simd ? '' : '_nosimd'}_internal`
  for (const file of [LANDMARKER.modelPath, `${wasm}.js`, `${wasm}.wasm`]) {
    try {
      const res = await fetch(assetUrl(file), { priority: 'low' } as RequestInit)
      await res.arrayBuffer() // read it all so it is stored, then let it go
    } catch {
      // A failed prefetch only means the real load happens later.
    }
  }
}
