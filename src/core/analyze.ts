// Landmarks in, face-shape analysis out. Pure. The one entry point the UI calls for M3.

import { explainFaceShape, type WhyThis } from './explain'
import { classifyFaceShape, type FaceShapeResult } from './faceShape'
import { faceScale, measureFace, type FaceScale, type Measurements, type Size } from './measure'
import type { Point3 } from './landmarks'
import type { Pose } from './pose'

export interface FaceAnalysis {
  measurements: Measurements
  /** Real-world size from the iris ruler, or null if the iris was too small to measure. */
  scale: FaceScale | null
  shape: FaceShapeResult
  why: WhyThis
}

export function analyzeFace(landmarks: readonly Point3[], size: Size, pose: Pose | null): FaceAnalysis {
  const measurements = measureFace(landmarks, size, pose)
  const shape = classifyFaceShape(measurements)
  return { measurements, scale: faceScale(landmarks, size, pose, measurements), shape, why: explainFaceShape(measurements, shape) }
}
