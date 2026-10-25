// Test helpers for the saved landmark fixtures in /fixtures (landmarks only, never images).

import test1 from '../../fixtures/test1.landmarks.json'
import type { Point3 } from './landmarks'
import type { Pose } from './pose'

export interface LandmarkFixture {
  id: string
  /** Face shape label if known. null = not labeled, so it must not be used to claim accuracy. */
  label: string | null
  size: { width: number; height: number }
  pose: Pose
  landmarks: Point3[]
}

const toFixture = (f: typeof test1): LandmarkFixture => ({
  id: f.id,
  label: f.label,
  size: f.size,
  pose: f.pose,
  landmarks: f.landmarks.map(([x, y, z]) => ({ x: x as number, y: y as number, z: z as number })),
})

export const FIXTURES: LandmarkFixture[] = [toFixture(test1)]
