// Recommendation engine (brief section 8). Pure. Rule based: every score is a sum of named parts,
// and every part that mattered leaves a plain-English reason. No model decides a score.
//
//   total = wShape * shape + wColor * color + wFit * fit + wPref * pref
//
// Frame colors do not interact with frame styles, so a style is ranked on shape, fit and taste,
// a color on skin and eye/hair harmony, and a (style, color) pair combines all four.

import { FACE_SHAPES } from './config/faceShapes'
import { FRAME_COLORS, type FrameColor } from './config/colors'
import { FRAME_STYLES, SIZES, frameFrontMm, lensCenterDistanceMm, type FrameStyle, type SizeId } from './config/frames'
import { COMPAT, FAMILY_LABEL, FAMILY_NOTE, RECOMMEND, STYLE_TAGS, type StyleChip } from './config/recommend'
import { SHAPE_LABEL } from './explain'
import type { FaceShapeResult } from './faceShape'
import type { ColorProfile, Undertone } from './colorProfile'
import { mean } from './color'
import type { FaceScale } from './measure'
import type { Preferences } from './preferences'

export interface RecommendContext {
  shape: FaceShapeResult
  /** Real-world face size, or null (then fit is neutral and sizes are not suggested firmly). */
  scale: FaceScale | null
  /** Color profile, or null (then colors are not ranked). */
  profile: ColorProfile | null
  prefs: Preferences
}

export interface StyleRec {
  styleId: string
  score: number
  parts: { shape: number; fit: number; pref: number }
  bestSize: SizeId
  /** Fit score for each size. */
  sizeFits: Record<SizeId, number>
  /** Why this style suits (or not), most relevant first. */
  reasons: string[]
  cautions: string[]
}

export interface ColorRec {
  colorId: string
  /** How well the color suits you (skin, eyes, hair), after the confidence flattening. No taste in it. */
  score: number
  /** `score` mixed with the user's taste. The colors list is ordered by this. */
  rankScore: number
  /** Before the confidence flattening, for the debug view. */
  raw: number
  parts: { temperature: number; depth: number; chroma: number; harmony: number }
  reasons: string[]
  cautions: string[]
}

export interface Recommendations {
  /** Every style, best first. */
  styles: StyleRec[]
  /** Every color, best first (by `rankScore`: suitability plus taste). */
  colors: ColorRec[]
  topStyles: StyleRec[]
  topColors: ColorRec[]
  /** Lowest-ranked items that also score poorly, each with a reason. */
  avoidStyles: { rec: StyleRec; reason: string }[]
  avoidColors: { rec: ColorRec; reason: string }[]
  /** Notes about how far to trust all this (low confidence, no scale, no skin reading). */
  notes: string[]
  styleById: ReadonlyMap<string, StyleRec>
  colorById: ReadonlyMap<string, ColorRec>
  /** Combined score for a pair. */
  comboScore: (styleId: string, colorId: string) => number
  /** The best color to pair with a style. */
  bestColorFor: (styleId: string) => ColorRec
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const ramp = (v: number, from: number, to: number) => clamp01((v - from) / (to - from))
const pct = (v: number) => `${Math.round(v * 100)}%`

const { weights: W, rules, color: C, fit: F, pref: PF, lists: L } = RECOMMEND

// ---- styles ----

const ASPECT = (s: FrameStyle) => s.lensH / s.lensW
const AVG_ASPECT = mean(FRAME_STYLES.map(ASPECT))
/** Width of the lens bottom relative to its top (1 = as wide at the bottom). Polygons are even. */
const bottomRatio = (s: FrameStyle) => (s.polygon ? 1 : 1 - 2 * s.taper * 0.26)

function shapeScore(style: FrameStyle, ctx: RecommendContext) {
  const p = ctx.shape.probabilities
  const base = FACE_SHAPES.reduce((sum, k) => sum + p[k] * COMPAT[style.family][k], 0)
  const tall = p.oblong * rules.tallness.strength * Math.max(-1, Math.min(1, (ASPECT(style) - AVG_ASPECT) / rules.tallness.fullAt))
  const heavy = -p.heart * rules.bottomHeavy.strength * ramp(bottomRatio(style), rules.bottomHeavy.threshold, 1)

  const reasons: string[] = []
  const cautions: string[] = []
  const primary = ctx.shape.primary
  const compat = COMPAT[style.family][primary]
  const fam = FAMILY_LABEL[style.family]
  const face = SHAPE_LABEL[primary].toLowerCase()
  if (ctx.shape.between) {
    const second = ctx.shape.secondary
    const c2 = COMPAT[style.family][second]
    if (compat >= 0.75 && c2 >= 0.75) reasons.push(`${fam} frames work for both of the shapes your face sits between (${SHAPE_LABEL[primary].toLowerCase()} and ${SHAPE_LABEL[second].toLowerCase()}): ${FAMILY_NOTE[style.family]}.`)
    else if (compat <= 0.5 && c2 <= 0.5) cautions.push(`${fam} frames are a weaker match for both ${SHAPE_LABEL[primary].toLowerCase()} and ${SHAPE_LABEL[second].toLowerCase()} faces.`)
  } else if (compat >= 0.8) reasons.push(`${fam} frames work well with your ${face} face: ${FAMILY_NOTE[style.family]}.`)
  else if (compat <= 0.5) cautions.push(`${fam} frames are a weaker match for a ${face} face.`)
  if (tall >= 0.01) reasons.push('Taller lenses suit your longer face.')
  if (tall <= -0.01) cautions.push('Shorter lenses can make a long face look longer.')
  if (heavy <= -0.01) cautions.push('A lens that is as wide at the bottom as at the top adds weight where your face narrows.')

  return { score: clamp01(base + tall + heavy), reasons, cautions }
}

function sizeFit(style: FrameStyle, size: (typeof SIZES)[number], scale: FaceScale | null) {
  if (!scale) return { score: F.unknownScore, ratio: null as number | null, pdDelta: null as number | null }
  const ratio = (frameFrontMm(style) * size.fitFactor) / scale.cheekMm
  const off = Math.abs(ratio - F.idealRatio)
  const width = off <= F.tolerance ? 1 : Math.max(F.floor, 1 - ((off - F.tolerance) / F.falloff) * (1 - F.floor))
  const pdDelta = lensCenterDistanceMm(style) * size.fitFactor - scale.ipdMm
  const [lo, hi] = F.pdOkMm
  const outside = pdDelta < lo ? lo - pdDelta : pdDelta > hi ? pdDelta - hi : 0
  const pupil = Math.max(F.pdFloor, 1 - (outside / F.pdFalloffMm) * (1 - F.pdFloor))
  return { score: F.weights.width * width + F.weights.pupil * pupil, ratio, pdDelta }
}

function fitFor(style: FrameStyle, ctx: RecommendContext) {
  const per = SIZES.map((s) => ({ size: s, ...sizeFit(style, s, ctx.scale) }))
  const best = per.reduce((a, b) => (b.score + (b.size.id === 'M' ? F.mBias : 0) > a.score + (a.size.id === 'M' ? F.mBias : 0) ? b : a))
  const sizeFits = Object.fromEntries(per.map((x) => [x.size.id, x.score])) as Record<SizeId, number>
  const reasons: string[] = []
  const cautions: string[] = []
  if (ctx.scale && best.ratio !== null) {
    const name = best.size.name.toLowerCase()
    const width = `${Math.round(frameFrontMm(style) * best.size.fitFactor)} mm`
    if (best.score >= 0.85) reasons.push(`A ${name} (about ${width} wide) is ${pct(best.ratio)} of your cheekbone width, a good fit.`)
    else if (best.score >= 0.6) reasons.push(`A ${name} is the closest size (${pct(best.ratio)} of your cheekbone width).`)
    else cautions.push(best.ratio > F.idealRatio ? `Even the smallest size is wide for your face (${pct(best.ratio)} of your cheekbone width).` : `Even the largest size is narrow for your face (${pct(best.ratio)} of your cheekbone width).`)
  }
  return { score: best.score, bestSize: best.size.id, sizeFits, reasons, cautions }
}

// ---- taste ----

const colorTags = (c: FrameColor): Record<StyleChip, number> => {
  const bold = ramp(c.chroma, 25, 55)
  const quiet = c.family === 'neutral' || c.family === 'metal' ? 1 : 0.5
  return { bold, minimal: clamp01((1 - bold) * quiet), classic: ['neutral', 'brown', 'metal'].includes(c.family) || c.id === 'navy' ? 1 : 0.4 }
}

function stylePref(style: FrameStyle, prefs: Preferences) {
  const { chipStrength, familySpill, styleCap } = PF
  const tag = prefs.chip ? STYLE_TAGS[style.id]?.[prefs.chip] ?? 0.5 : 0.5
  const chip = prefs.chip ? (tag - 0.5) * chipStrength : 0
  const own = prefs.styleLikes[style.id] ?? 0
  const spill = FRAME_STYLES.filter((s) => s.family === style.family && s.id !== style.id).reduce((n, s) => n + (prefs.styleLikes[s.id] ?? 0), 0) * familySpill
  const likes = Math.max(-styleCap, Math.min(styleCap, own + spill))
  return { score: clamp01(0.5 + chip + likes), chip, likes, tag }
}

function colorPref(color: FrameColor, prefs: Preferences) {
  const chip = prefs.chip ? (colorTags(color)[prefs.chip] - 0.5) * PF.chipStrength : 0
  const likes = Math.max(-PF.colorCap, Math.min(PF.colorCap, prefs.colorLikes[color.id] ?? 0))
  return clamp01(0.5 + chip + likes)
}

// ---- colors ----

const labDist = (a: readonly number[], b: readonly number[]) => Math.hypot((a[0] as number) - (b[0] as number), (a[1] as number) - (b[1] as number), (a[2] as number) - (b[2] as number))

function temperatureScore(color: FrameColor, profile: ColorProfile) {
  const row = (u: Undertone) => C.temperature[u][color.temperature]
  let score = row(profile.undertone)
  // A shaky label hedges toward its neighbour.
  if (profile.undertoneNear) score = (1 - C.borderlineHedge) * score + C.borderlineHedge * row(profile.undertoneNear)
  if (color.family === 'metal' || color.family === 'neutral') score += C.safeBonus
  return clamp01(score)
}

function colorScore(color: FrameColor, ctx: RecommendContext) {
  const { profile } = ctx
  if (!profile) {
    return { score: C.neutralScore, raw: C.neutralScore, parts: { temperature: C.neutralScore, depth: C.neutralScore, chroma: C.neutralScore, harmony: C.neutralScore }, reasons: [] as string[], cautions: [] as string[] }
  }
  const name = color.name
  const reasons: string[] = []
  const cautions: string[] = []

  const temperature = temperatureScore(color, profile)
  if (temperature >= 0.95 && profile.undertone !== 'neutral') reasons.push(`${name} suits your ${profile.undertone} undertone.`)
  else if (temperature >= 0.8 && color.temperature === 'neutral') reasons.push(`${name} is a neutral color that works with any undertone.`)
  else if (temperature <= 0.4) cautions.push(`${name} is a ${color.temperature} color, and your undertone looks ${profile.undertone}.`)

  const visibility = color.material === 'translucent' ? C.translucentVisibility : 1
  const deltaL = Math.abs(color.lightness - profile.skinLab[0]) * visibility
  const depth = ramp(deltaL, C.minDeltaL, C.goodDeltaL)
  if (depth >= 0.9) reasons.push(`${name} stands out clearly against your skin.`)
  else if (depth <= 0.35) cautions.push(color.material === 'translucent' ? `${name} is see-through and close to your skin color, so it may barely show.` : `${name} is close to your skin color, so it may fade into your face.`)

  const contrast = profile.contrast ?? 'medium'
  const ideal = C.chromaIdealMax[contrast]
  const chroma = 1 - (1 - C.chromaFloor) * ramp(color.chroma, ideal, ideal + C.chromaFalloff)
  if (chroma < 0.75) cautions.push(`${name} is quite vivid for your ${contrast}-contrast look.`)
  else if (contrast === 'low' && color.chroma < 25) reasons.push(`A soft shade like ${name} fits your low-contrast look.`)

  let harmony = C.harmonyBase
  const refs: { lab: readonly number[]; label: string }[] = []
  if (profile.eyeLab) refs.push({ lab: profile.eyeLab, label: 'eye color' })
  if (profile.hairLab) refs.push({ lab: profile.hairLab, label: 'hair' })
  let echoLabel: string | null = null
  for (const r of refs) {
    const echo = 1 - ramp(labDist(color.lab, r.lab), C.echoNear, C.echoFar)
    if (echo > harmony) {
      harmony = echo
      echoLabel = r.label
    }
  }
  if (profile.hairLab) {
    const clean = ramp(Math.abs(color.lightness - profile.hairLab[0]), C.cleanContrastFrom, C.cleanContrastTo) * C.cleanContrastValue
    if (clean > harmony) {
      harmony = clean
      echoLabel = null
    }
  }
  if (echoLabel && harmony >= 0.8) reasons.push(`${name} echoes your ${echoLabel}.`)

  const w = C.weights
  const raw = w.temperature * temperature + w.depth * depth + w.chroma * chroma + w.harmony * harmony
  const flatten = Math.max(C.confidenceFloor, Math.min(1, profile.confidence))
  const score = clamp01(C.neutralScore + (raw - C.neutralScore) * flatten)
  return { score, raw, parts: { temperature, depth, chroma, harmony }, reasons, cautions }
}

// ---- assembly ----

export function recommend(ctx: RecommendContext): Recommendations {
  const wStyle = W.shape + W.fit + W.pref

  const styles: StyleRec[] = FRAME_STYLES.map((style): StyleRec => {
    const shape = shapeScore(style, ctx)
    const fit = fitFor(style, ctx)
    const pref = stylePref(style, ctx.prefs)
    const reasons = [...shape.reasons, ...fit.reasons]
    const cautions = [...shape.cautions, ...fit.cautions]
    if (ctx.prefs.chip && pref.tag >= 0.75) reasons.push(`It matches the ${ctx.prefs.chip} look you chose.`)
    else if (ctx.prefs.chip && pref.tag <= 0.25) cautions.push(`It is less ${ctx.prefs.chip} than the look you chose.`)
    if (pref.likes >= 0.1) reasons.push('You liked this style or similar ones.')
    if (pref.likes <= -0.1) cautions.push('You passed on this style or similar ones.')
    return {
      styleId: style.id,
      score: (W.shape * shape.score + W.fit * fit.score + W.pref * pref.score) / wStyle,
      parts: { shape: shape.score, fit: fit.score, pref: pref.score },
      bestSize: fit.bestSize,
      sizeFits: fit.sizeFits,
      reasons,
      cautions,
    }
  })

  const colors: ColorRec[] = FRAME_COLORS.map((color): ColorRec => {
    const c = colorScore(color, ctx)
    const pref = colorPref(color, ctx.prefs)
    const reasons = [...c.reasons]
    const cautions = [...c.cautions]
    if (pref >= 0.62) reasons.push(`It fits the ${ctx.prefs.chip ?? 'style'} look you picked.`)
    return { colorId: color.id, score: c.score, rankScore: (W.color * c.score + W.pref * pref) / (W.color + W.pref), raw: c.raw, parts: c.parts, reasons, cautions }
  })

  const order = <T>(xs: T[], by: (x: T) => number) => xs.map((x, i) => ({ x, i })).sort((a, b) => by(b.x) - by(a.x) || a.i - b.i).map((e) => e.x)
  const sortedStyles = order(styles, (s) => s.score)
  const sortedColors = order(colors, (c) => c.rankScore)
  const styleById = new Map(styles.map((s) => [s.styleId, s]))
  const colorById = new Map(colors.map((c) => [c.colorId, c]))

  const colorPrefOf = new Map(FRAME_COLORS.map((c) => [c.id, colorPref(c, ctx.prefs)]))
  const comboScore = (styleId: string, colorId: string) => {
    const s = styleById.get(styleId)
    const c = colorById.get(colorId)
    if (!s || !c) throw new Error(`Unknown pair ${styleId} / ${colorId}`)
    const pref = PF.styleShare * s.parts.pref + (1 - PF.styleShare) * (colorPrefOf.get(colorId) ?? 0.5)
    return W.shape * s.parts.shape + W.color * c.score + W.fit * s.parts.fit + W.pref * pref
  }
  const bestColorFor = (styleId: string) => {
    let best = sortedColors[0] as ColorRec
    let bestScore = -Infinity
    for (const c of sortedColors) {
      const sc = comboScore(styleId, c.colorId)
      if (sc > bestScore) {
        best = c
        bestScore = sc
      }
    }
    return best
  }

  const avoidStyles = [...sortedStyles].reverse().slice(0, L.avoidCount).filter((s) => s.score < L.avoidStyleBelow).map((rec) => ({ rec, reason: rec.cautions[0] ?? 'It ranks lowest for your face.' }))
  // Lowest by taste-adjusted rank, but only listed if the color itself also suits poorly.
  const avoidColors = [...sortedColors].reverse().slice(0, L.avoidCount).filter((c) => c.score < L.avoidColorBelow).map((rec) => ({ rec, reason: rec.cautions[0] ?? 'It ranks lowest for your coloring.' }))

  const notes: string[] = []
  if (!ctx.profile) notes.push('We could not read your skin color, so colors are not ranked.')
  else if (ctx.profile.confidence < 0.6) notes.push('Your color reading is not very sure, so color picks are kept broad. Better light would sharpen them.')
  if (!ctx.scale) notes.push('We could not measure your face size in millimetres, so frame sizes are not ranked.')
  else notes.push('Sizes are estimated from the width of your iris, so treat them as good to about 10%.')
  if (ctx.shape.between) notes.push('Your face sits between two shapes, so style picks lean on both.')

  return {
    styles: sortedStyles,
    colors: sortedColors,
    topStyles: sortedStyles.slice(0, L.topStyles),
    topColors: sortedColors.slice(0, L.topColors),
    avoidStyles,
    avoidColors,
    notes,
    styleById,
    colorById,
    comboScore,
    bestColorFor,
  }
}

/** The reasons to show for one (style, color) pair: style first, then color, and anything to be careful about. */
export function explainPair(recs: Recommendations, styleId: string, colorId: string) {
  const s = recs.styleById.get(styleId)
  const c = recs.colorById.get(colorId)
  return { reasons: [...(s?.reasons ?? []), ...(c?.reasons ?? [])], cautions: [...(s?.cautions ?? []), ...(c?.cautions ?? [])], score: recs.comboScore(styleId, colorId) }
}

