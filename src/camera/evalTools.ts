// Browser-side helpers for the evaluation tools: analyze a file, and export a fixture from it.
// A fixture is LANDMARKS plus a small color summary. The picture itself is never stored or exported.

import { analyzeFace } from '../core/analyze'
import type { ColorProfile } from '../core/colorProfile'
import { analyzeImageFile } from './analyzeImage'
import type { CaptureResult } from './captureResult'
import { profileFromCapture } from './colorFromCapture'
import type { EvalFixture } from '../eval/fixtures'
import type { VariantRow } from '../eval/robustness'
import type { Variant } from './perturb'

export interface Analyzed {
  result: CaptureResult
  profile: ColorProfile | null
  analysis: ReturnType<typeof analyzeFace>
}

export async function analyzeFile(file: File): Promise<Analyzed> {
  const result = await analyzeImageFile(file)
  const size = { width: result.image.width, height: result.image.height }
  return { result, profile: profileFromCapture(result), analysis: analyzeFace(result.landmarks, size, result.pose) }
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5

export function toFixture(a: Analyzed, id: string, meta: EvalFixture['meta']): EvalFixture {
  const { result, profile } = a
  return {
    id,
    size: { width: result.image.width, height: result.image.height },
    pose: result.pose,
    landmarks: result.landmarks.map((p) => ({ x: r5(p.x), y: r5(p.y), z: r5(p.z) })),
    quality: Object.fromEntries(Object.entries(result.quality.metrics).filter(([, v]) => Number.isFinite(v))),
    color: profile
      ? {
          skinLab: [profile.skinLab[0], profile.skinLab[1], profile.skinLab[2]],
          hueDeg: profile.hueDeg,
          undertone: profile.undertone,
          warmth: profile.warmth,
          depth: profile.depth,
          confidence: profile.confidence,
          confidenceLevel: profile.confidenceLevel,
        }
      : undefined,
    meta: { ...meta, source: 'upload' },
  }
}

/** The JSON text of a fixture, in the shape the evaluation CLI reads (landmarks as [x, y, z] triples). */
export function fixtureJson(f: EvalFixture): string {
  return JSON.stringify({ ...f, landmarks: f.landmarks.map((p) => [p.x, p.y, p.z]) })
}

export function download(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const safeId = (s: string) => s.trim().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'face'

/** Runs every variant through the real pipeline, one at a time. A variant with no face becomes a row with ok = false. */
export async function runVariants(variants: readonly Variant[], onProgress?: (done: number, total: number) => void): Promise<VariantRow[]> {
  const rows: VariantRow[] = []
  for (const v of variants) {
    try {
      const a = await analyzeFile(await v.make())
      const m = a.analysis.measurements
      rows.push({
        name: v.name,
        group: v.group,
        ok: true,
        lengthToWidth: m.lengthToWidth,
        foreheadToCheek: m.foreheadToCheek,
        jawToCheek: m.jawToCheek,
        chinAngle: m.chinAngle,
        jawAngularity: m.jawAngularity,
        primary: a.analysis.shape.primary,
        undertone: a.profile?.undertone,
        depth: a.profile?.depth,
        confidence: a.profile?.confidence,
        irisDiameterPx: a.analysis.scale?.irisDiameterPx,
      })
    } catch {
      rows.push({ name: v.name, group: v.group, ok: false })
    }
    onProgress?.(rows.length, variants.length)
  }
  return rows
}
