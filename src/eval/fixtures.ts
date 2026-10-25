// Fixture formats and parsers for the M8 evaluation. Pure (no file access): callers pass text in.
//
// A fixture holds LANDMARKS only, never a picture. Color results are stored as a small summary computed
// on the device that took the photo, so nothing that could identify a face is kept.

import { FACE_SHAPES, type FaceShape } from '../core/config/faceShapes'
import { LANDMARK_COUNT } from '../core/config/landmarker'
import type { Point3 } from '../core/landmarks'
import type { Pose } from '../core/pose'

export interface ColorSummary {
  skinLab: [number, number, number]
  hueDeg: number
  undertone: string
  warmth: number
  depth: string
  confidence: number
  confidenceLevel: string
}

export interface FixtureMeta {
  /** Who this is (a pseudonym such as "p01"), for stability and color groups. */
  person?: string
  /** For the color test: "daylight", "indoor-warm", "indoor-cool", ... */
  condition?: string
  /** Capture number within a stability set. */
  capture?: number
  source?: string
}

export interface EvalFixture {
  id: string
  size: { width: number; height: number }
  pose: Pose | null
  landmarks: Point3[]
  /** Quality gate numbers, if recorded. */
  quality?: Record<string, number>
  color?: ColorSummary
  meta?: FixtureMeta
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Validates a parsed fixture and returns it, or throws an error that says exactly what is wrong. */
export function parseFixture(raw: unknown, where = 'fixture'): EvalFixture {
  const fail = (msg: string): never => {
    throw new Error(`${where}: ${msg}`)
  }
  if (typeof raw !== 'object' || raw === null) return fail('not a JSON object')
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id === '') fail('missing "id"')
  const size = r.size as Record<string, unknown> | undefined
  if (!size || !isNum(size.width) || !isNum(size.height) || size.width <= 0 || size.height <= 0) fail('"size" must have a positive width and height')
  const lm = r.landmarks
  if (!Array.isArray(lm) || lm.length < LANDMARK_COUNT - 10) fail(`"landmarks" must be a list of about ${LANDMARK_COUNT} [x, y, z] triples`)
  const landmarks = (lm as unknown[]).map((p, i): Point3 => {
    if (Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(isNum)) return { x: p[0] as number, y: p[1] as number, z: p[2] as number }
    if (typeof p === 'object' && p !== null && isNum((p as Point3).x) && isNum((p as Point3).y) && isNum((p as Point3).z)) return p as Point3
    return fail(`landmark ${i} is not a finite [x, y, z]`)
  })
  let pose: Pose | null = null
  if (r.pose !== undefined && r.pose !== null) {
    const p = r.pose as Record<string, unknown>
    if (!isNum(p.yaw) || !isNum(p.pitch) || !isNum(p.roll)) fail('"pose" must have numeric yaw, pitch and roll')
    pose = { yaw: p.yaw as number, pitch: p.pitch as number, roll: p.roll as number }
  }
  return {
    id: r.id as string,
    size: { width: (size as Record<string, number>).width as number, height: (size as Record<string, number>).height as number },
    pose,
    landmarks,
    quality: r.quality && typeof r.quality === 'object' ? (r.quality as Record<string, number>) : undefined,
    color: parseColor(r.color, where),
    meta: r.meta && typeof r.meta === 'object' ? (r.meta as FixtureMeta) : undefined,
  }
}

function parseColor(raw: unknown, where: string): ColorSummary | undefined {
  if (raw === undefined || raw === null) return undefined
  const c = raw as Record<string, unknown>
  const lab = c.skinLab
  if (!Array.isArray(lab) || lab.length !== 3 || !lab.every(isNum) || !isNum(c.hueDeg) || !isNum(c.warmth) || !isNum(c.confidence) || typeof c.undertone !== 'string' || typeof c.depth !== 'string') {
    throw new Error(`${where}: "color" is incomplete (needs skinLab, hueDeg, undertone, warmth, depth, confidence)`)
  }
  return {
    skinLab: [lab[0] as number, lab[1] as number, lab[2] as number],
    hueDeg: c.hueDeg,
    undertone: c.undertone,
    warmth: c.warmth,
    depth: c.depth,
    confidence: c.confidence,
    confidenceLevel: typeof c.confidenceLevel === 'string' ? c.confidenceLevel : '',
  }
}

// ---- CSV ----

/** Splits CSV text into rows of trimmed cells. Blank lines and lines starting with # are skipped. No quoting support (none is needed). */
export function parseCsv(text: string): string[][] {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .map((l) => l.split(',').map((c) => c.trim()))
}

export interface LabelRow {
  id: string
  /** One entry per labeler, in column order. Empty strings (a labeler who skipped this face) are dropped. */
  votes: FaceShape[]
}

/** labels.csv: `id,labeler1,labeler2,labeler3`. Throws on a shape name that is not one of the six. */
export function parseLabels(text: string): LabelRow[] {
  const rows = parseCsv(text)
  const body = rows[0]?.[0]?.toLowerCase() === 'id' ? rows.slice(1) : rows
  return body.map((cells, i) => {
    const [id, ...votes] = cells
    if (!id) throw new Error(`labels.csv row ${i + 1}: missing id`)
    const parsed = votes.filter((v) => v !== '').map((v) => v.toLowerCase())
    for (const v of parsed) {
      if (!(FACE_SHAPES as readonly string[]).includes(v)) throw new Error(`labels.csv row ${i + 1} (${id}): "${v}" is not one of ${FACE_SHAPES.join(', ')}`)
    }
    return { id, votes: parsed as FaceShape[] }
  })
}

export type Arm = 'top' | 'random'

export interface RatingRow {
  participant: string
  trial: number
  style: string
  color: string
  size: string
  arm: Arm
  /** Where the engine ranked this style (1 = best). */
  rank: number
  /** 1 to 5: "does this frame suit me?" */
  rating: number
}

export const RATING_HEADER = 'participant,trial,style,color,size,arm,rank,rating'

/** ratings.csv as exported by the study screen. Throws on a bad arm or a rating outside 1-5. */
export function parseRatings(text: string): RatingRow[] {
  const rows = parseCsv(text)
  const body = rows[0]?.[0]?.toLowerCase() === 'participant' ? rows.slice(1) : rows
  return body.map((c, i) => {
    const [participant, trial, style, color, size, arm, rank, rating] = c
    if (!participant || !style || !color || !size) throw new Error(`ratings.csv row ${i + 1}: missing a field`)
    if (arm !== 'top' && arm !== 'random') throw new Error(`ratings.csv row ${i + 1}: arm must be "top" or "random", got "${arm}"`)
    const r = Number(rating)
    if (!Number.isInteger(r) || r < 1 || r > 5) throw new Error(`ratings.csv row ${i + 1}: rating must be a whole number from 1 to 5, got "${rating}"`)
    return { participant, trial: Number(trial), style, color, size, arm, rank: Number(rank), rating: r }
  })
}

export interface PerfEntry {
  device: string
  kind: 'laptop' | 'phone' | 'other'
  note?: string
  /** Time from page start to the landing screen being usable, ms. */
  loadToLandingMs?: number
  /** Time to create the face model (cold, then warm), ms. */
  modelLoadMs: number
  modelLoadWarmMs?: number
  firstDetectionMs: number
  detectFrames: number
  detectMsMedian: number
  detectMsP95: number
  detectFps: number
  /** 1000 / median detection ms: how fast detection could go if the camera were not the limit. */
  headroomFps?: number
  delegate?: string
  userAgent?: string
}

export function parsePerf(raw: unknown, where = 'perf'): PerfEntry {
  const r = raw as Record<string, unknown>
  const need = ['modelLoadMs', 'firstDetectionMs', 'detectFrames', 'detectMsMedian', 'detectMsP95', 'detectFps'] as const
  if (typeof r !== 'object' || r === null || typeof r.device !== 'string') throw new Error(`${where}: missing "device"`)
  for (const k of need) if (!isNum(r[k])) throw new Error(`${where}: "${k}" must be a number`)
  const kind = r.kind === 'laptop' || r.kind === 'phone' ? r.kind : 'other'
  return { ...(r as unknown as PerfEntry), kind }
}
