// The five evaluations from brief section 9, as pure functions over parsed fixtures. No file access.
// Each returns a `status` so a section with too little data says so instead of printing a convincing number.

import { analyzeFace } from '../core/analyze'
import { EVAL } from '../core/config/eval'
import { FACE_SHAPES, type FaceShape } from '../core/config/faceShapes'
import {
  angleDiffDeg,
  confusionMatrix,
  deltaE76,
  fleissKappa,
  flipRate,
  logLoss,
  majorityVote,
  mean,
  pairedComparison,
  pairwiseAgreement,
  perClass,
  spread,
  topKAccuracy,
  type ClassScores,
  type Confusion,
  type PairedResult,
  type Spread,
} from './metrics'
import type { EvalFixture, LabelRow, PerfEntry, RatingRow } from './fixtures'

export type Status = 'no-data' | 'insufficient' | 'ok'

export interface Section {
  status: Status
  /** One plain sentence on what is missing, when it is not "ok". */
  message: string
}

const sectionFor = (have: number, need: number, noun: readonly [singular: string, plural: string]): Section =>
  have === 0
    ? { status: 'no-data', message: `No ${noun[1]} yet. Needs at least ${need}.` }
    : have < need
      ? { status: 'insufficient', message: `Only ${have} ${have === 1 ? noun[0] : noun[1]} so far; needs at least ${need}. Numbers below are shown for completeness, not as a result.` }
      : { status: 'ok', message: '' }

const analyze = (f: EvalFixture) => analyzeFace(f.landmarks, f.size, f.pose)

// ---- 1. face shape against labelers ----

export interface ShapeItem {
  id: string
  votes: FaceShape[]
  consensus: FaceShape | null
  predicted: FaceShape
  secondary: FaceShape
  probabilities: Record<FaceShape, number>
  between: boolean
}

export interface FaceShapeEval extends Section {
  /** Faces that have a fixture and at least one label. */
  items: number
  /** Faces where a strict majority of labelers agreed. These are the ones accuracy is computed on. */
  withConsensus: number
  noConsensusIds: string[]
  /** Labels with no fixture, and fixtures with no label (usually a typo in an id). */
  labelsWithoutFixture: string[]
  fixturesWithoutLabel: string[]
  agreement: {
    labelers: number
    unanimous: number
    pairwise: number
    fleissKappa: number
    /** How often each individual labeler matched the majority, for context on how fuzzy the labels are. */
    labelerVsMajority: number
  }
  top1: number
  top2: number
  /** Share where the prediction matches at least one labeler: the softer, fairer figure for a fuzzy task. */
  matchesAnyLabeler: number
  logLoss: number
  confusion: Confusion | null
  perClass: Record<string, ClassScores> | null
  rows: ShapeItem[]
}

export function evalFaceShape(fixtures: readonly EvalFixture[], labels: readonly LabelRow[]): FaceShapeEval {
  const byId = new Map(fixtures.map((f) => [f.id, f]))
  const labelIds = new Set(labels.map((l) => l.id))
  const rows: ShapeItem[] = []
  for (const l of labels) {
    const f = byId.get(l.id)
    if (!f || l.votes.length === 0) continue
    const a = analyze(f)
    rows.push({
      id: l.id,
      votes: l.votes,
      consensus: majorityVote(l.votes).label as FaceShape | null,
      predicted: a.shape.primary,
      secondary: a.shape.secondary,
      probabilities: a.shape.probabilities,
      between: a.shape.between,
    })
  }
  const scored = rows.filter((r) => r.consensus !== null)
  const truth = scored.map((r) => r.consensus as string)
  const labelers = Math.max(0, ...rows.map((r) => r.votes.length))
  const full = rows.filter((r) => r.votes.length === labelers && labelers >= 2).map((r) => r.votes as string[])
  const asMajority = rows.flatMap((r) => (r.consensus ? r.votes.map((v) => v === r.consensus) : []))

  const section = sectionFor(scored.length, EVAL.minShapeItems, ['face with a labeler majority', 'faces with a labeler majority'])
  return {
    ...section,
    items: rows.length,
    withConsensus: scored.length,
    noConsensusIds: rows.filter((r) => r.consensus === null).map((r) => r.id),
    labelsWithoutFixture: labels.filter((l) => !byId.has(l.id)).map((l) => l.id),
    fixturesWithoutLabel: fixtures.filter((f) => !labelIds.has(f.id)).map((f) => f.id),
    agreement: {
      labelers,
      unanimous: full.filter((v) => v.every((x) => x === v[0])).length,
      pairwise: pairwiseAgreement(full),
      fleissKappa: fleissKappa(full, FACE_SHAPES),
      labelerVsMajority: mean(asMajority.map((b) => (b ? 1 : 0))),
    },
    top1: scored.length ? scored.filter((r) => r.predicted === r.consensus).length / scored.length : NaN,
    top2: topKAccuracy(truth, scored.map((r) => r.probabilities), 2),
    matchesAnyLabeler: rows.length ? rows.filter((r) => r.votes.includes(r.predicted)).length / rows.length : NaN,
    logLoss: logLoss(truth, scored.map((r) => r.probabilities)),
    confusion: scored.length ? confusionMatrix(FACE_SHAPES, truth, scored.map((r) => r.predicted)) : null,
    perClass: scored.length ? perClass(confusionMatrix(FACE_SHAPES, truth, scored.map((r) => r.predicted))) : null,
    rows,
  }
}

// ---- 2. measurement stability ----

export const STABILITY_FEATURES = ['lengthToWidth', 'foreheadToCheek', 'jawToCheek', 'chinAngle', 'jawAngularity'] as const
export type StabilityFeature = (typeof STABILITY_FEATURES)[number]

export interface PersonStability {
  person: string
  captures: number
  features: Record<StabilityFeature, Spread>
  /** Share of captures whose primary shape differs from this person's most common one. */
  shapeFlipRate: number
  primaryShapes: Record<string, number>
  /** Ratio of the biggest to the smallest top probability across captures. */
  topProbability: Spread
}

export interface StabilityEval extends Section {
  people: PersonStability[]
  /** Mean over people of each feature's coefficient of variation. */
  meanCv: Record<StabilityFeature, number>
  meanShapeFlipRate: number
}

export function evalStability(groups: Readonly<Record<string, readonly EvalFixture[]>>): StabilityEval {
  const people: PersonStability[] = Object.entries(groups)
    .filter(([, fs]) => fs.length >= 2)
    .map(([person, fs]) => {
      const a = fs.map(analyze)
      const features = Object.fromEntries(
        STABILITY_FEATURES.map((k) => [k, spread(a.map((x) => x.measurements[k]))]),
      ) as Record<StabilityFeature, Spread>
      const primaries = a.map((x) => x.shape.primary)
      const counts: Record<string, number> = {}
      for (const p of primaries) counts[p] = (counts[p] ?? 0) + 1
      return {
        person,
        captures: fs.length,
        features,
        shapeFlipRate: flipRate(primaries),
        primaryShapes: counts,
        topProbability: spread(a.map((x) => x.shape.probabilities[x.shape.primary])),
      }
    })
  const best = Math.max(0, ...people.map((p) => p.captures))
  return {
    ...sectionFor(best, EVAL.minCaptures, ['capture of one person', 'captures of one person']),
    people,
    meanCv: Object.fromEntries(STABILITY_FEATURES.map((k) => [k, mean(people.map((p) => p.features[k].cv))])) as Record<StabilityFeature, number>,
    meanShapeFlipRate: mean(people.map((p) => p.shapeFlipRate)),
  }
}

// ---- 3. color stability across lighting ----

export interface ColorDrift {
  person: string
  condition: string
  reference: string
  /** CIE76 distance between this condition's skin color and the reference's. */
  deltaE: number
  /** Signed hue shift in degrees (positive = yellower). */
  hueShiftDeg: number
  undertoneFlip: boolean
  depthChanged: boolean
  confidence: number
  referenceConfidence: number
}

export interface ColorEval extends Section {
  rows: ColorDrift[]
  flips: number
  comparisons: number
  /** Conditions (other than the reference) where confidence was lower than the reference's. */
  confidenceLower: number
  /** Among drifts above 5 delta E, how many had lower confidence than the reference (does confidence notice trouble?). */
  confidenceNoticedBigDrift: { noticed: number; of: number }
}

export function evalColor(groups: Readonly<Record<string, Readonly<Record<string, EvalFixture>>>>): ColorEval {
  const rows: ColorDrift[] = []
  let maxConditions = 0
  for (const [person, conds] of Object.entries(groups)) {
    const withColor = Object.entries(conds).filter(([, f]) => f.color)
    maxConditions = Math.max(maxConditions, withColor.length)
    const ref = withColor.find(([c]) => c === EVAL.referenceCondition) ?? [...withColor].sort(([a], [b]) => a.localeCompare(b))[0]
    if (!ref) continue
    const refColor = ref[1].color!
    for (const [condition, f] of withColor) {
      if (condition === ref[0]) continue
      const c = f.color!
      rows.push({
        person,
        condition,
        reference: ref[0],
        deltaE: deltaE76(c.skinLab, refColor.skinLab),
        hueShiftDeg: angleDiffDeg(c.hueDeg, refColor.hueDeg),
        undertoneFlip: c.undertone !== refColor.undertone,
        depthChanged: c.depth !== refColor.depth,
        confidence: c.confidence,
        referenceConfidence: refColor.confidence,
      })
    }
  }
  const big = rows.filter((r) => r.deltaE > 5)
  return {
    ...sectionFor(maxConditions, EVAL.minConditions, ['lighting condition for one person', 'lighting conditions for one person']),
    rows,
    flips: rows.filter((r) => r.undertoneFlip).length,
    comparisons: rows.length,
    confidenceLower: rows.filter((r) => r.confidence < r.referenceConfidence).length,
    confidenceNoticedBigDrift: { noticed: big.filter((r) => r.confidence < r.referenceConfidence).length, of: big.length },
  }
}

// ---- 4. user rating study ----

export interface RatingEval extends Section {
  participants: number
  ratings: number
  /** Participants dropped for having fewer than the minimum trials in an arm. */
  excluded: string[]
  result: PairedResult | null
}

export function evalRatings(rows: readonly RatingRow[]): RatingEval {
  const by = new Map<string, { top: number[]; random: number[] }>()
  for (const r of rows) {
    const e = by.get(r.participant) ?? { top: [], random: [] }
    e[r.arm].push(r.rating)
    by.set(r.participant, e)
  }
  const kept = [...by.entries()].filter(([, e]) => e.top.length >= EVAL.minTrialsPerArm && e.random.length >= EVAL.minTrialsPerArm)
  const result = kept.length ? pairedComparison(kept.map(([, e]) => ({ a: mean(e.top), b: mean(e.random) })), 5000, EVAL.seed) : null
  return {
    ...sectionFor(kept.length, EVAL.minParticipants, ['participant who rated both arms', 'participants who rated both arms']),
    participants: kept.length,
    ratings: rows.length,
    excluded: [...by.entries()].filter(([, e]) => e.top.length < EVAL.minTrialsPerArm || e.random.length < EVAL.minTrialsPerArm).map(([p]) => p),
    result,
  }
}

// ---- 5. performance ----

export interface PerfEval extends Section {
  entries: PerfEntry[]
  hasPhone: boolean
}

export function evalPerf(entries: readonly PerfEntry[]): PerfEval {
  const hasPhone = entries.some((e) => e.kind === 'phone')
  const base = sectionFor(entries.length, 2, ['device measured', 'devices measured'])
  return {
    ...base,
    entries: [...entries],
    hasPhone,
    // The brief asks for a low-end Android phone and a laptop. Say so if the phone is missing.
    message: base.status === 'ok' && !hasPhone ? 'No phone measured yet; the brief asks for a low-end Android phone as well as a laptop.' : base.message,
    status: base.status === 'ok' && !hasPhone ? 'insufficient' : base.status,
  }
}

// ---- everything ----

export interface EvalInputs {
  shape: { fixtures: EvalFixture[]; labels: LabelRow[] }
  stability: Record<string, EvalFixture[]>
  color: Record<string, Record<string, EvalFixture>>
  ratings: RatingRow[]
  perf: PerfEntry[]
}

export interface EvalReport {
  shape: FaceShapeEval
  stability: StabilityEval
  color: ColorEval
  ratings: RatingEval
  perf: PerfEval
}

export function buildReport(i: EvalInputs): EvalReport {
  return {
    shape: evalFaceShape(i.shape.fixtures, i.shape.labels),
    stability: evalStability(i.stability),
    color: evalColor(i.color),
    ratings: evalRatings(i.ratings),
    perf: evalPerf(i.perf),
  }
}

