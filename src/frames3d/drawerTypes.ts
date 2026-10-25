// The small surface the camera code needs from the 3D try-on. Types only, so importing this never pulls in three.js.

import type { Point3 } from '../core/landmarks'
import type { FrameSpec } from '../frames/catalog'

export interface Drawer3D {
  setSpec: (spec: FrameSpec) => void
  /** Draws the frame on the given landmarks (smoothed inside). `tSec` is the frame time in seconds. */
  draw: (landmarks: readonly Point3[], width: number, height: number, sizeFactor: number, tSec: number) => void
  /** Empties the canvas (no face this frame). */
  clear: () => void
  /** Forget the smoothing history (a new face appeared, or the picture changed). */
  reset: () => void
  dispose: () => void
}
