// Color profile from a photo: depth, undertone, contrast, and how far to trust them (brief section 7). Pure.
//
// A phone photo gives an ESTIMATE of skin color, not a measurement: auto white balance and tone
// mapping have already altered it. So every result carries a confidence, and low confidence is
// reported plainly instead of hidden.

import { COLOR, type DepthId } from './config/color'
import { QUALITY } from './config/quality'
import { labToRgb, type Lab } from './color'
import { sampleEyes, sampleHair, sampleSkin, type HairSample, type SkinSample } from './colorSampling'
import type { Point3 } from './landmarks'
import type { QualityReport } from './quality'
import type { ImageLike } from './roi'

export type Undertone = 'cool' | 'neutral' | 'warm'
export type Contrast = 'low' | 'medium' | 'high'
export type ConfidenceLevel = 'High' | 'Medium' | 'Low'
export type HairSource = 'sampled' | 'skin-like' | 'insufficient' | 'covered'

export interface UndertoneAnswers {
  /** Wrist veins look blue/purple (cool), green (warm), or can't tell. */
  veins: 'blue' | 'green' | 'unsure'
  /** Which jewelry looks better on you. */
  jewelry: 'silver' | 'gold' | 'unsure'
  /** How skin reacts to sun: burns easily (cool) or tans easily (warm). */
  sun: 'burn' | 'tan' | 'unsure'
}

export interface ColorProfile {
  skinLab: Lab
  skinHex: string
  depth: DepthId
  /** Individual Typology Angle in degrees. */
  ita: number
  /** h = atan2(b*, a*), degrees. */
  hueDeg: number
  undertone: Undertone
  /** 0 = cool .. 1 = warm, after any blending with the user's answers. */
  warmth: number
  /** What the photo alone said, before any blending. */
  measured: { undertone: Undertone; warmth: number }
  undertoneConfidence: number
  /**
   * Set when the photo-only hue sits close to a band edge: the label is shaky, and this is the
   * neighbouring label it is close to ("cool, close to neutral"). null when it is clearly inside
   * its band, or when the user's answers were blended in.
   */
  undertoneNear: Undertone | null
  hairLab?: Lab
  hairSource: HairSource
  eyeLab?: Lab
  scleraLab?: Lab
  contrast: Contrast | null
  contrastDeltaL: number | null
  contrastBasis: 'hair+eyes' | 'hair' | 'eyes' | 'none'
  /** 0..1 overall trust in this profile. */
  confidence: number
  confidenceLevel: ConfidenceLevel
  /** Each factor 0..1; the confidence is their product. For the debug view. */
  factors: Record<string, number>
  /** Plain-language reasons the result may be off, and what would help. */
  warnings: string[]
  /** True when the user's answers were blended into the undertone. */
  answersApplied: boolean
  /** The numbers behind it, for the debug view. */
  debug: {
    skin: SkinSample
    hair: HairSample
    castMagnitude: number | null
    castVector: [number, number] | null
    /** What the sclera-based correction does at its current strength (zero while the strength is 0). */
    appliedShift: [number, number]
    rawSkinLab: Lab
    blendWeight: number
  }
}

export interface AnalyzeColorOptions {
  /** The user wears a head covering, so the hair box shows fabric, not hair. */
  headCovered?: boolean
  answers?: UndertoneAnswers | null
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** 0 at `from`, 1 at `to` (either direction). */
const ramp = (v: number, from: number, to: number) => clamp01((v - from) / (to - from))
const DEG = 180 / Math.PI

export function ita(L: number, b: number): number {
  return Math.atan2(L - 50, b) * DEG
}

export function depthFromIta(angle: number): DepthId {
  for (const band of COLOR.itaBands) if (angle >= band.min) return band.id
  return 'dark'
}

export const hueOf = (a: number, b: number) => ((Math.atan2(b, a) * DEG) % 360 + 360) % 360

/** Hue (degrees) to a 0 (cool) .. 1 (warm) score. */
export const warmthFromHue = (hueDeg: number) => ramp(hueDeg, COLOR.undertone.rampLowDeg, COLOR.undertone.rampHighDeg)

const coolWarmth = () => warmthFromHue(COLOR.undertone.coolMaxHueDeg)
const warmWarmth = () => warmthFromHue(COLOR.undertone.warmMinHueDeg)

export function undertoneFromWarmth(warmth: number): Undertone {
  return warmth < coolWarmth() ? 'cool' : warmth > warmWarmth() ? 'warm' : 'neutral'
}

/** How firmly a hue sits inside its label's band: 0 on an edge, 1 well inside (or mid-band for neutral). */
export function bandMargin(hueDeg: number): number {
  const { coolMaxHueDeg: c, warmMinHueDeg: w, marginSoftDeg: soft } = COLOR.undertone
  if (hueDeg < c) return clamp01((c - hueDeg) / soft)
  if (hueDeg > w) return clamp01((hueDeg - w) / soft)
  return clamp01(Math.min(hueDeg - c, w - hueDeg) / ((w - c) / 2))
}

/** The user's answers as a 0 (cool) .. 1 (warm) score, or null if none were answered. */
export function selfWarmth(a: UndertoneAnswers): { warmth: number; answered: number } | null {
  const votes = [
    a.veins === 'blue' ? -1 : a.veins === 'green' ? 1 : null,
    a.jewelry === 'silver' ? -1 : a.jewelry === 'gold' ? 1 : null,
    a.sun === 'burn' ? -1 : a.sun === 'tan' ? 1 : null,
  ].filter((v): v is -1 | 1 => v !== null)
  if (votes.length === 0) return null
  return { warmth: (votes.reduce((s, v) => s + v, 0) / votes.length + 1) / 2, answered: votes.length }
}

/** Blends the measured warmth with the user's answers; the less sure the photo, the more the answers count. */
export function blendWarmth(measured: number, confidence: number, answers: UndertoneAnswers | null | undefined) {
  const self = answers ? selfWarmth(answers) : null
  if (!self) return { warmth: measured, weight: 0 }
  const base = Math.min(COLOR.confirm.maxWeight, Math.max(COLOR.confirm.minWeight, 1 - confidence))
  const weight = base * (self.answered / 3)
  return { warmth: (1 - weight) * measured + weight * self.warmth, weight }
}

export function contrastFrom(skinL: number, hairL: number | null, eyeL: number | null) {
  const { hairWeight, lowMax, highMin } = COLOR.contrast
  const hairD = hairL === null ? null : Math.abs(skinL - hairL)
  const eyeD = eyeL === null ? null : Math.abs(skinL - eyeL)
  let delta: number | null = null
  let basis: ColorProfile['contrastBasis'] = 'none'
  if (hairD !== null && eyeD !== null) {
    delta = hairWeight * hairD + (1 - hairWeight) * eyeD
    basis = 'hair+eyes'
  } else if (hairD !== null) {
    delta = hairD
    basis = 'hair'
  } else if (eyeD !== null) {
    delta = eyeD
    basis = 'eyes'
  }
  const contrast: Contrast | null = delta === null ? null : delta < lowMax ? 'low' : delta >= highMin ? 'high' : 'medium'
  return { contrast, delta, basis }
}

function confidenceFactors(skin: SkinSample, meanL: number, castMagnitude: number | null, quality: QualityReport | null | undefined) {
  const c = COLOR.confidence
  const [okLo, okHi] = c.lightOk
  const [badLo, badHi] = c.lightBad
  // Lighting: full trust in the middle, falling to the floor at the extremes.
  const dim = meanL < okLo ? ramp(meanL, okLo, badLo) : 0
  const bright = meanL > okHi ? ramp(meanL, okHi, badHi) : 0
  const lighting = 1 - (1 - c.lightFloor) * Math.max(dim, bright)

  const clipped = quality?.metrics.clipped ?? 0
  const crushed = quality?.metrics.crushed ?? 0
  const clipping = 1 - Math.min(c.clipPenaltyCap, (clipped + crushed) * c.clipPenaltyPerFrac)

  const agreement = skin.deltaL === null ? 0.8 : 1 - (1 - c.deltaFloor) * ramp(skin.deltaL, c.deltaLOk, c.deltaLBad)
  const cast = castMagnitude === null ? c.castUnknown : 1 - (1 - c.castFloor) * ramp(castMagnitude, COLOR.sclera.castStart, COLOR.sclera.castFull)
  const edge = quality?.metrics.edgeEnergy
  const glasses = edge !== undefined && edge > QUALITY.glasses.maxEdgeEnergy ? c.glassesFactor : 1
  const samples = 0.5 + 0.5 * ramp(skin.count, COLOR.skin.minPixels, c.fullPixels)

  return { lighting, clipping, agreement, cast, glasses, samples }
}

export function analyzeColor(
  input: { landmarks: readonly Point3[]; image: ImageLike; quality?: QualityReport | null },
  opts: AnalyzeColorOptions = {},
): ColorProfile | null {
  const { landmarks: lm, image: img } = input
  const skin = sampleSkin(lm, img)
  if (!skin.combined) return null
  const rawSkin = skin.combined

  // Eye white: a rough white reference. Used to lower confidence; the correction itself is off by default.
  const eyes = sampleEyes(lm, img)
  const [a0, b0] = COLOR.sclera.expectedAB
  const castVector: [number, number] | null = eyes.sclera ? [eyes.sclera.lab[1] - a0, eyes.sclera.lab[2] - b0] : null
  const castMagnitude = castVector ? Math.hypot(castVector[0], castVector[1]) : null
  const { strength, maxShift } = COLOR.correction
  const shift = (v: number) => Math.max(-maxShift, Math.min(maxShift, v * strength))
  const appliedShift: [number, number] = castVector ? [shift(castVector[0]), shift(castVector[1])] : [0, 0]
  const skinLab: Lab = [rawSkin[0], rawSkin[1] - appliedShift[0], rawSkin[2] - appliedShift[1]]

  const angle = ita(skinLab[0], skinLab[2])
  const hueDeg = hueOf(skinLab[1], skinLab[2])
  const measuredWarmth = warmthFromHue(hueDeg)
  const measuredUndertone = undertoneFromWarmth(measuredWarmth)

  // Hair and eyes -> contrast.
  const hair = sampleHair(lm, img, skinLab)
  const hairSource: HairSource = opts.headCovered ? 'covered' : hair.source
  const hairLab = hairSource === 'sampled' ? hair.stat?.lab : undefined
  const eyeLab = eyes.iris?.lab
  const { contrast, delta, basis } = contrastFrom(skinLab[0], hairLab?.[0] ?? null, eyeLab?.[0] ?? null)

  // Confidence.
  const meanL = skin.combined[0]
  const factors = confidenceFactors(skin, meanL, castMagnitude, input.quality)
  const confidence = Math.max(0.05, Object.values(factors).reduce((p, v) => p * v, 1))
  const confidenceLevel: ConfidenceLevel = confidence >= COLOR.confidence.high ? 'High' : confidence >= COLOR.confidence.medium ? 'Medium' : 'Low'

  // Optional: blend in the user's answers.
  const blend = blendWarmth(measuredWarmth, confidence, opts.answers)
  const warmth = blend.warmth
  const undertone = blend.weight > 0 ? undertoneFromWarmth(warmth) : measuredUndertone
  const margin = bandMargin(hueDeg)
  const undertoneConfidence = confidence * (0.5 + 0.5 * margin)
  const { coolMaxHueDeg, warmMinHueDeg, borderlineMargin } = COLOR.undertone
  const nearestOther: Undertone = measuredUndertone === 'neutral' ? (hueDeg - coolMaxHueDeg < warmMinHueDeg - hueDeg ? 'cool' : 'warm') : 'neutral'
  const undertoneNear = blend.weight === 0 && margin < borderlineMargin ? nearestOther : null

  const warnings: string[] = []
  if (factors.lighting < 0.8) warnings.push(meanL < COLOR.confidence.lightOk[0] ? 'Your skin looks quite dark in this photo, which can make the result read deeper than it is. Try again in brighter, even light.' : 'Your skin looks very bright in this photo, which can make the result read lighter than it is. Try again out of direct light.')
  if (factors.clipping < 0.9) warnings.push('Parts of your cheeks are blown out or too dark to read.')
  if (factors.agreement < 0.8) warnings.push('One cheek is lit very differently from the other. Face the light directly.')
  if (factors.cast < 0.8) warnings.push('The photo has a colour tint, so your undertone may be shifted. Try neutral, white light.')
  if (factors.glasses < 1) warnings.push('Glasses can tint the skin around them. Take them off for the best result.')
  if (factors.samples < 0.75) warnings.push('We could only read a small patch of skin.')

  return {
    skinLab,
    skinHex: '#' + labToRgb(...skinLab).map((v) => v.toString(16).padStart(2, '0')).join(''),
    depth: depthFromIta(angle),
    ita: angle,
    hueDeg,
    undertone,
    warmth,
    measured: { undertone: measuredUndertone, warmth: measuredWarmth },
    undertoneConfidence,
    undertoneNear,
    hairLab,
    hairSource,
    eyeLab,
    scleraLab: eyes.sclera?.lab,
    contrast,
    contrastDeltaL: delta,
    contrastBasis: basis,
    confidence,
    confidenceLevel,
    factors,
    warnings,
    answersApplied: blend.weight > 0,
    debug: { skin, hair, castMagnitude, castVector, appliedShift, rawSkinLab: rawSkin, blendWeight: blend.weight },
  }
}
