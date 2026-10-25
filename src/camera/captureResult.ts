import type { Point3 } from '../core/landmarks'
import type { Pose } from '../core/pose'
import type { QualityReport } from '../core/quality'

/** What M2 hands to the rest of the pipeline. Camera captures and uploaded photos both produce this. */
export interface CaptureResult {
  source: 'camera' | 'upload'
  /** Per-landmark median over the kept frames (a single frame for uploads). */
  landmarks: Point3[]
  /** Median head pose over the kept frames, in degrees. */
  pose: Pose | null
  /** In-memory picture the landmarks belong to. Not mirrored. */
  image: HTMLCanvasElement
  framesKept: number
  framesRejected: number
  quality: QualityReport
}
