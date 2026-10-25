// Test helpers: SYNTHETIC faces made by stretching and jittering one real fixture's landmarks.
// Used only to check that the evaluation code does its sums right. These are NOT data and prove nothing
// about how well the app recognizes real faces.

import { FIXTURES } from '../core/fixtures'
import type { Point3 } from '../core/landmarks'
import type { EvalFixture } from './fixtures'
import { seeded } from './metrics'

const BASE = FIXTURES[0]!

/** Stretches the face horizontally (sx) and vertically (sy) about its center, with optional per-point jitter. */
export function warp(sx: number, sy: number, jitter = 0, seed = 1): Point3[] {
  const rand = seeded(seed)
  return BASE.landmarks.map((p) => ({
    x: 0.5 + (p.x - 0.5) * sx + (rand() - 0.5) * jitter,
    y: 0.5 + (p.y - 0.5) * sy + (rand() - 0.5) * jitter,
    z: p.z,
  }))
}

export function fixtureOf(id: string, landmarks: Point3[], meta?: EvalFixture['meta'], color?: EvalFixture['color']): EvalFixture {
  return { id, size: BASE.size, pose: BASE.pose, landmarks, meta, color }
}

/** n faces whose length-to-width ratio sweeps from `from` to `to`. */
export function sweep(n: number, from = 0.75, to = 1.35): EvalFixture[] {
  return Array.from({ length: n }, (_, i) => fixtureOf(`s${String(i).padStart(2, '0')}`, warp(1, from + ((to - from) * i) / Math.max(1, n - 1))))
}

export const rawFixtureJson = () => ({
  id: BASE.id,
  size: BASE.size,
  pose: BASE.pose,
  landmarks: BASE.landmarks.map((p) => [p.x, p.y, p.z]),
})
