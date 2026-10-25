// Summarizes the "robustness check": one photo re-analyzed after being resized, re-lit, recompressed,
// rotated, cropped and shifted. Pure.
//
// This is NOT the brief's stability test. That one needs repeated captures of a real person. This one
// only shows how much the pipeline moves when the same picture is changed in ways a real camera does.

import { flipRate, mean, spread, type Spread } from './metrics'

export type VariantGroup = 'original' | 'scale' | 'light' | 'compression' | 'rotation' | 'crop' | 'shift'

export interface VariantRow {
  name: string
  group: VariantGroup
  /** False if no face was found in this variant. */
  ok: boolean
  lengthToWidth?: number
  foreheadToCheek?: number
  jawToCheek?: number
  chinAngle?: number
  jawAngularity?: number
  primary?: string
  undertone?: string
  depth?: string
  confidence?: number
  irisDiameterPx?: number
}

export const ROBUST_FEATURES = ['lengthToWidth', 'foreheadToCheek', 'jawToCheek', 'chinAngle', 'jawAngularity'] as const
export type RobustFeature = (typeof ROBUST_FEATURES)[number]

export interface RobustnessSummary {
  variants: number
  withFace: number
  features: Record<RobustFeature, Spread>
  /** Mean absolute change from the original in each group, for length / width. */
  lengthToWidthShiftByGroup: Partial<Record<VariantGroup, number>>
  shapeFlipRate: number
  shapes: Record<string, number>
  undertoneFlipRate: number
  depthFlipRate: number
  confidence: Spread
  /** The variants that changed the primary shape, undertone or depth from the original's. */
  changed: { name: string; what: string[] }[]
}

export function summarizeRobustness(rows: readonly VariantRow[]): RobustnessSummary {
  const ok = rows.filter((r) => r.ok)
  const original = ok.find((r) => r.group === 'original')
  const values = (k: RobustFeature) => ok.map((r) => r[k]).filter((v): v is number => typeof v === 'number')

  const byGroup: Partial<Record<VariantGroup, number[]>> = {}
  if (original?.lengthToWidth !== undefined) {
    for (const r of ok) {
      if (r === original || r.lengthToWidth === undefined) continue
      ;(byGroup[r.group] ??= []).push(Math.abs(r.lengthToWidth - original.lengthToWidth))
    }
  }

  const shapes: Record<string, number> = {}
  for (const r of ok) if (r.primary) shapes[r.primary] = (shapes[r.primary] ?? 0) + 1

  const changed = original
    ? ok
        .filter((r) => r !== original)
        .map((r) => ({
          name: r.name,
          what: [r.primary !== original.primary ? `shape ${original.primary} to ${r.primary}` : '', r.undertone !== original.undertone ? `undertone ${original.undertone} to ${r.undertone}` : '', r.depth !== original.depth ? `depth ${original.depth} to ${r.depth}` : ''].filter(Boolean),
        }))
        .filter((c) => c.what.length > 0)
    : []

  return {
    variants: rows.length,
    withFace: ok.length,
    features: Object.fromEntries(ROBUST_FEATURES.map((k) => [k, spread(values(k))])) as Record<RobustFeature, Spread>,
    lengthToWidthShiftByGroup: Object.fromEntries(Object.entries(byGroup).map(([g, v]) => [g, mean(v as number[])])),
    shapeFlipRate: flipRate(ok.flatMap((r) => (r.primary ? [r.primary] : []))),
    shapes,
    undertoneFlipRate: flipRate(ok.flatMap((r) => (r.undertone ? [r.undertone] : []))),
    depthFlipRate: flipRate(ok.flatMap((r) => (r.depth ? [r.depth] : []))),
    confidence: spread(ok.flatMap((r) => (typeof r.confidence === 'number' ? [r.confidence] : []))),
    changed,
  }
}
