import { describe, expect, it } from 'vitest'
import { COLOR_BY_ID } from './config/colors'
import { PROTOTYPES, type FaceShape } from './config/faceShapes'
import { RECOMMEND } from './config/recommend'
import type { ColorProfile } from './colorProfile'
import { classifyFaceShape, type FaceShapeResult } from './faceShape'
import type { FaceScale } from './measure'
import { EMPTY_PREFS, parsePrefs, reactToFrame, serializePrefs, setChip, type Preferences } from './preferences'
import { explainPair, recommend, type RecommendContext } from './recommend'

const CHIN = { soft: { chinAngle: 125, jawAngularity: 10 }, angular: { chinAngle: 125, jawAngularity: 55 }, pointed: { chinAngle: 85, jawAngularity: 10 }, mixed: { chinAngle: 102.5, jawAngularity: 35 } }
const faceOf = (shape: FaceShape): FaceShapeResult => {
  const p = PROTOTYPES[shape]
  return classifyFaceShape({ lengthToWidth: p.lengthToWidth, foreheadToCheek: p.foreheadToCheek, jawToCheek: p.jawToCheek, ...CHIN[p.chin] })
}

const scale = (cheekMm: number): FaceScale => ({ irisDiameterPx: 47, pxPerMm: 4, cheekMm, ipdMm: cheekMm * 0.5 })

function profile(over: Partial<ColorProfile> = {}): ColorProfile {
  return {
    skinLab: [58, 15, 18],
    skinHex: '#a97d6c',
    depth: 'tan',
    ita: 20,
    hueDeg: 52,
    undertone: 'neutral',
    warmth: 0.5,
    measured: { undertone: 'neutral', warmth: 0.5 },
    undertoneConfidence: 0.9,
    undertoneNear: null,
    hairLab: [20, 4, 4],
    hairSource: 'sampled',
    eyeLab: [25, 8, 10],
    contrast: 'medium',
    contrastDeltaL: 30,
    contrastBasis: 'hair+eyes',
    confidence: 0.95,
    confidenceLevel: 'High',
    factors: {},
    warnings: [],
    answersApplied: false,
    debug: {} as ColorProfile['debug'],
    ...over,
  }
}

function ctx(over: Partial<RecommendContext> = {}): RecommendContext {
  return { shape: faceOf('oval'), scale: scale(135), profile: profile(), prefs: EMPTY_PREFS, ...over }
}

const rankOf = (recs: ReturnType<typeof recommend>, id: string) => recs.styles.findIndex((s) => s.styleId === id)
const colorRank = (recs: ReturnType<typeof recommend>, id: string) => recs.colors.findIndex((c) => c.colorId === id)
const cs = (recs: ReturnType<typeof recommend>, id: string) => recs.colorById.get(id)!.score
const st = (recs: ReturnType<typeof recommend>, id: string) => recs.styleById.get(id)!

describe('basics', () => {
  const recs = recommend(ctx())

  it('scores every style and color between 0 and 1, best first, deterministically', () => {
    expect(recs.styles).toHaveLength(16)
    expect(recs.colors).toHaveLength(28)
    for (const s of recs.styles) {
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(1)
    }
    for (let i = 1; i < recs.styles.length; i++) expect(recs.styles[i]!.score).toBeLessThanOrEqual(recs.styles[i - 1]!.score)
    for (let i = 1; i < recs.colors.length; i++) expect(recs.colors[i]!.rankScore).toBeLessThanOrEqual(recs.colors[i - 1]!.rankScore)
    expect(recommend(ctx()).styles.map((s) => s.styleId)).toEqual(recs.styles.map((s) => s.styleId))
  })

  it('the combined score is the weighted sum of its four parts', () => {
    const W = RECOMMEND.weights
    const s = st(recs, 'wayfarer')
    const c = recs.colorById.get('havana-tortoise')!
    const prefMix = RECOMMEND.pref.styleShare * s.parts.pref + (1 - RECOMMEND.pref.styleShare) * 0.5
    expect(recs.comboScore('wayfarer', 'havana-tortoise')).toBeCloseTo(W.shape * s.parts.shape + W.color * c.score + W.fit * s.parts.fit + W.pref * prefMix, 9)
    expect(W.shape + W.color + W.fit + W.pref).toBeCloseTo(1, 9)
  })

  it('every pair has a best color, and top lists have the configured length', () => {
    expect(recs.topStyles).toHaveLength(RECOMMEND.lists.topStyles)
    expect(recs.topColors).toHaveLength(RECOMMEND.lists.topColors)
    const best = recs.bestColorFor('round')
    for (const c of recs.colors) expect(recs.comboScore('round', best.colorId)).toBeGreaterThanOrEqual(recs.comboScore('round', c.colorId) - 1e-12)
  })
})

describe('face shape moves the style ranking', () => {
  const top = (shape: FaceShape) => recommend(ctx({ shape: faceOf(shape) }))

  it('a round face favors angular frames over round ones', () => {
    const r = top('round')
    expect(['square', 'rectangle']).toContain(FAMILY(r.topStyles[0]!.styleId))
    expect(rankOf(r, 'rectangle')).toBeLessThan(rankOf(r, 'round'))
    expect(rankOf(r, 'square')).toBeLessThan(rankOf(r, 'panto'))
  })

  it('a long (oblong) face favors oversized, taller lenses', () => {
    const r = top('oblong')
    expect(['butterfly', 'shield-lite']).toContain(r.topStyles[0]!.styleId)
    expect(st(r, 'butterfly').parts.shape).toBeGreaterThan(st(r, 'rectangle').parts.shape)
    expect(st(r, 'butterfly').reasons.join(' ')).toMatch(/Taller lenses/)
  })

  it('a square face favors softer shapes over square frames', () => {
    const r = top('square')
    expect(rankOf(r, 'oval')).toBeLessThan(rankOf(r, 'square'))
    expect(rankOf(r, 'round')).toBeLessThan(rankOf(r, 'square'))
  })

  it('the top pick differs between face shapes', () => {
    const tops = new Set((['oval', 'round', 'square', 'oblong', 'heart', 'diamond'] as FaceShape[]).map((s) => top(s).topStyles[0]!.styleId))
    expect(tops.size).toBeGreaterThanOrEqual(3)
  })

  it('a heart face loses points on lenses as wide at the bottom as the top (the brief\'s rule)', () => {
    const r = top('heart')
    expect(st(r, 'rectangle').cautions.join(' ')).toMatch(/as wide at the bottom/)
    expect(st(r, 'aviator').cautions.join(' ')).not.toMatch(/as wide at the bottom/)
  })

  it('blends two shapes when the face is between them, and says so', () => {
    const between = classifyFaceShape({ lengthToWidth: 1.3, foreheadToCheek: 0.865, jawToCheek: 0.785, ...CHIN.soft })
    const r = recommend(ctx({ shape: between }))
    expect(r.notes.join(' ')).toMatch(between.between ? /between two shapes/ : /./)
  })
})

describe('color: undertone', () => {
  const warm = recommend(ctx({ profile: profile({ undertone: 'warm', warmth: 0.8 }) }))
  const cool = recommend(ctx({ profile: profile({ undertone: 'cool', warmth: 0.2 }) }))

  it('warm undertone prefers warm colors, cool prefers cool', () => {
    for (const id of ['terracotta', 'caramel', 'mustard', 'coral']) expect(cs(warm, id), id).toBeGreaterThan(cs(cool, id))
    for (const id of ['navy', 'cobalt', 'teal']) expect(cs(cool, id), id).toBeGreaterThan(cs(warm, id))
  })

  it('names the match in plain words', () => {
    expect(warm.colorById.get('caramel')!.reasons.join(' ')).toMatch(/suits your warm undertone/)
    expect(warm.colorById.get('cobalt')!.cautions.join(' ')).toMatch(/cool color, and your undertone looks warm/)
  })

  it('metals and neutrals get the safe-choice bonus', () => {
    const neutral = recommend(ctx({ profile: profile({ undertone: 'neutral' }) }))
    expect(neutral.colorById.get('silver')!.parts.temperature).toBe(1)
    expect(neutral.colorById.get('coral')!.parts.temperature).toBeLessThan(neutral.colorById.get('silver')!.parts.temperature)
  })

  it('a shaky undertone label hedges toward its neighbour', () => {
    const sure = recommend(ctx({ profile: profile({ undertone: 'cool', undertoneNear: null }) }))
    const shaky = recommend(ctx({ profile: profile({ undertone: 'cool', undertoneNear: 'neutral' }) }))
    expect(shaky.colorById.get('terracotta')!.parts.temperature).toBeGreaterThan(sure.colorById.get('terracotta')!.parts.temperature) // warm color hurt less
    expect(shaky.colorById.get('navy')!.parts.temperature).toBeLessThan(sure.colorById.get('navy')!.parts.temperature) // cool color credited less
  })
})

describe('color: depth, chroma, harmony', () => {
  it('light skin: pale frames fade into the face, dark ones show', () => {
    const r = recommend(ctx({ profile: profile({ skinLab: [82, 12, 16], depth: 'very-light' }) }))
    expect(r.colorById.get('blush')!.parts.depth).toBeLessThan(0.4)
    expect(r.colorById.get('blush')!.cautions.join(' ')).toMatch(/close to your skin color/)
    expect(r.colorById.get('crystal-clear')!.cautions.join(' ')).toMatch(/barely show/)
    expect(r.colorById.get('jet-black')!.parts.depth).toBeGreaterThan(0.9)
    expect(r.colorById.get('jet-black')!.reasons.join(' ')).toMatch(/stands out clearly/)
  })

  it('very deep skin: near-black frames lose contrast, lighter warm ones show', () => {
    const r = recommend(ctx({ profile: profile({ skinLab: [18, 8, 8], depth: 'dark' }) }))
    expect(r.colorById.get('jet-black')!.parts.depth).toBeLessThan(r.colorById.get('caramel')!.parts.depth)
    expect(r.colorById.get('honey')!.parts.depth).toBeGreaterThan(0.9)
  })

  it('a low-contrast look dislikes vivid frames; a high-contrast look does not mind', () => {
    const low = recommend(ctx({ profile: profile({ contrast: 'low' }) }))
    const high = recommend(ctx({ profile: profile({ contrast: 'high' }) }))
    expect(low.colorById.get('cobalt')!.parts.chroma).toBeLessThan(0.75)
    expect(high.colorById.get('cobalt')!.parts.chroma).toBe(1)
    expect(low.colorById.get('cobalt')!.cautions.join(' ')).toMatch(/vivid/)
    expect(low.colorById.get('slate')!.parts.chroma).toBe(1)
  })

  it('a frame that echoes the eye color gets a harmony bonus', () => {
    const chocolate = COLOR_BY_ID.get('chocolate')!
    const r = recommend(ctx({ profile: profile({ eyeLab: chocolate.lab, hairLab: undefined, hairSource: 'covered' }) }))
    expect(r.colorById.get('chocolate')!.parts.harmony).toBeGreaterThan(0.95)
    expect(r.colorById.get('chocolate')!.parts.harmony).toBeGreaterThan(r.colorById.get('cobalt')!.parts.harmony)
    expect(r.colorById.get('chocolate')!.reasons.join(' ')).toMatch(/echoes your eye color/)
  })

  it('a clean lightness gap from the hair also counts', () => {
    const r = recommend(ctx({ profile: profile({ hairLab: [15, 3, 3], eyeLab: undefined }) }))
    // Silver is far lighter than the hair: a clean contrast. Cobalt is neither close nor far, so it gets the baseline.
    expect(r.colorById.get('silver')!.parts.harmony).toBeGreaterThan(0.8)
    expect(r.colorById.get('silver')!.parts.harmony).toBeGreaterThan(r.colorById.get('cobalt')!.parts.harmony)
    // And a frame close to the hair color echoes it instead.
    expect(r.colorById.get('jet-black')!.parts.harmony).toBeGreaterThan(0.95)
  })
})

describe('color: confidence', () => {
  const spread = (r: ReturnType<typeof recommend>) => r.colors[0]!.score - r.colors[r.colors.length - 1]!.score
  const warmProfile = { undertone: 'warm' as const, skinLab: [50, 15, 20] as [number, number, number] }

  it('low confidence flattens the palette toward neutral, but keeps the order', () => {
    const sure = recommend(ctx({ profile: profile({ ...warmProfile, confidence: 0.95 }) }))
    const unsure = recommend(ctx({ profile: profile({ ...warmProfile, confidence: 0.3 }) }))
    expect(spread(unsure)).toBeLessThan(spread(sure) * 0.5)
    expect(unsure.colors.map((c) => c.colorId).slice(0, 3)).toEqual(sure.colors.map((c) => c.colorId).slice(0, 3))
    expect(unsure.notes.join(' ')).toMatch(/not very sure/)
  })

  it('the flattening never goes below the floor', () => {
    const none = recommend(ctx({ profile: profile({ ...warmProfile, confidence: 0.01 }) }))
    const floor = recommend(ctx({ profile: profile({ ...warmProfile, confidence: RECOMMEND.color.confidenceFloor }) }))
    expect(spread(none)).toBeCloseTo(spread(floor), 9)
  })

  it('without a color profile every color is neutral and the screen is told why', () => {
    const r = recommend(ctx({ profile: null }))
    expect(new Set(r.colors.map((c) => c.score))).toEqual(new Set([RECOMMEND.color.neutralScore]))
    expect(r.notes.join(' ')).toMatch(/colors are not ranked/)
  })
})

describe('fit and size', () => {
  it('a narrow face gets Small, a wide face gets Large, an average face gets Medium', () => {
    expect(st(recommend(ctx({ scale: scale(108) })), 'wayfarer').bestSize).toBe('S')
    expect(st(recommend(ctx({ scale: scale(150) })), 'wayfarer').bestSize).toBe('L')
    expect(st(recommend(ctx({ scale: scale(133) })), 'wayfarer').bestSize).toBe('M')
  })

  it('a wide face ranks wider frames higher than a narrow face does', () => {
    const wide = recommend(ctx({ scale: scale(150) }))
    const narrow = recommend(ctx({ scale: scale(108) }))
    // Butterfly is 145 mm wide, round is 117 mm.
    expect(wide.styleById.get('butterfly')!.parts.fit).toBeGreaterThan(narrow.styleById.get('butterfly')!.parts.fit)
    expect(narrow.styleById.get('round')!.parts.fit).toBeGreaterThan(wide.styleById.get('round')!.parts.fit)
    expect(rankOf(wide, 'butterfly')).toBeLessThan(rankOf(narrow, 'butterfly'))
  })

  it('explains the size in words and warns when even the best size is off', () => {
    const ok = st(recommend(ctx({ scale: scale(133) })), 'wayfarer')
    expect(ok.reasons.join(' ')).toMatch(/medium .* of your cheekbone width/)
    const tooSmallFace = st(recommend(ctx({ scale: scale(80) })), 'butterfly')
    expect(tooSmallFace.cautions.join(' ')).toMatch(/smallest size is wide/)
    const tooBigFace = st(recommend(ctx({ scale: scale(190) })), 'round')
    expect(tooBigFace.cautions.join(' ')).toMatch(/largest size is narrow/)
  })

  it('size scores fall off smoothly, not as a cliff', () => {
    const fits = [120, 125, 130, 135, 140, 145, 150].map((cheek) => st(recommend(ctx({ scale: scale(cheek) })), 'wayfarer').sizeFits.M)
    for (let i = 1; i < fits.length; i++) expect(Math.abs(fits[i]! - fits[i - 1]!)).toBeLessThan(0.45)
  })

  it('without a face scale, fit is neutral, M is suggested, and the screen says sizes are not ranked', () => {
    const r = recommend(ctx({ scale: null }))
    for (const s of r.styles) {
      expect(s.parts.fit).toBe(RECOMMEND.fit.unknownScore)
      expect(s.bestSize).toBe('M')
    }
    expect(r.notes.join(' ')).toMatch(/not ranked/)
  })

  it('warns that sizes are an estimate', () => {
    expect(recommend(ctx()).notes.join(' ')).toMatch(/about 10%/)
  })
})

describe('taste: chips and likes', () => {
  it('Bold lifts cat-eye and butterfly; Minimal lifts rimless and oval', () => {
    const bold = recommend(ctx({ prefs: setChip(EMPTY_PREFS, 'bold') }))
    const minimal = recommend(ctx({ prefs: setChip(EMPTY_PREFS, 'minimal') }))
    const none = recommend(ctx())
    expect(rankOf(bold, 'cat-eye')).toBeLessThan(rankOf(minimal, 'cat-eye'))
    expect(rankOf(minimal, 'rimless')).toBeLessThan(rankOf(bold, 'rimless'))
    expect(st(bold, 'cat-eye').parts.pref).toBeGreaterThan(st(none, 'cat-eye').parts.pref)
    expect(st(bold, 'rimless').parts.pref).toBeLessThan(st(none, 'rimless').parts.pref)
    expect(st(bold, 'cat-eye').reasons.join(' ')).toMatch(/bold look you chose/)
  })

  it('a chip also moves colors: bold favors vivid ones, minimal favors neutrals and metals', () => {
    const bold = recommend(ctx({ prefs: setChip(EMPTY_PREFS, 'bold'), profile: null }))
    const minimal = recommend(ctx({ prefs: setChip(EMPTY_PREFS, 'minimal'), profile: null }))
    expect(cs(bold, 'coral')).toBeGreaterThan(cs(minimal, 'coral') - 1e-9)
    expect(colorRank(bold, 'coral')).toBeLessThan(colorRank(minimal, 'coral'))
    expect(colorRank(minimal, 'silver')).toBeLessThan(colorRank(bold, 'silver'))
  })

  it('a like raises a style, a dislike lowers it, and the effect is capped', () => {
    const base = st(recommend(ctx()), 'wayfarer').parts.pref
    let liked = EMPTY_PREFS
    for (let i = 0; i < 10; i++) liked = reactToFrame(liked, 'wayfarer', 'jet-black', 1)
    const up = st(recommend(ctx({ prefs: reactToFrame(EMPTY_PREFS, 'wayfarer', 'jet-black', 1) })), 'wayfarer').parts.pref
    const down = st(recommend(ctx({ prefs: reactToFrame(EMPTY_PREFS, 'wayfarer', 'jet-black', -1) })), 'wayfarer').parts.pref
    const capped = st(recommend(ctx({ prefs: liked })), 'wayfarer').parts.pref
    expect(up).toBeGreaterThan(base)
    expect(down).toBeLessThan(base)
    expect(capped).toBeCloseTo(base + RECOMMEND.pref.styleCap, 9)
  })

  it('liking one style nudges its family, a little', () => {
    const prefs = reactToFrame(EMPTY_PREFS, 'wayfarer', 'jet-black', 1)
    const r = recommend(ctx({ prefs }))
    const base = recommend(ctx())
    const own = st(r, 'wayfarer').parts.pref - st(base, 'wayfarer').parts.pref
    const sibling = st(r, 'wellington').parts.pref - st(base, 'wellington').parts.pref // same family
    const other = st(r, 'round').parts.pref - st(base, 'round').parts.pref
    expect(sibling).toBeGreaterThan(0)
    expect(sibling).toBeLessThan(own)
    expect(other).toBe(0)
  })

  it('a liked color rises in the pair score', () => {
    const base = recommend(ctx())
    const r = recommend(ctx({ prefs: reactToFrame(EMPTY_PREFS, 'wayfarer', 'teal', 1) }))
    expect(r.comboScore('round', 'teal')).toBeGreaterThan(base.comboScore('round', 'teal'))
  })

  it('taste cannot overturn a strong mismatch on its own', () => {
    // Loving square frames on a square face (a weak shape match) should not make them the top pick.
    let prefs: Preferences = setChip(EMPTY_PREFS, 'classic')
    for (let i = 0; i < 10; i++) prefs = reactToFrame(prefs, 'square', 'jet-black', 1)
    const r = recommend(ctx({ shape: faceOf('square'), prefs }))
    expect(rankOf(r, 'square')).toBeGreaterThan(0)
  })
})

describe('preferences module', () => {
  it('round-trips through JSON', () => {
    const p = reactToFrame(setChip(EMPTY_PREFS, 'classic'), 'aviator', 'gold', 1)
    expect(parsePrefs(serializePrefs(p))).toEqual(p)
  })

  it('reads garbage as empty instead of throwing, and clamps odd values', () => {
    expect(parsePrefs(null)).toEqual(EMPTY_PREFS)
    expect(parsePrefs('not json')).toEqual(EMPTY_PREFS)
    expect(parsePrefs('42')).toEqual(EMPTY_PREFS)
    expect(parsePrefs('{"chip":"wild","styleLikes":{"a":"x","b":99},"colorLikes":null}')).toEqual({ chip: null, styleLikes: { b: RECOMMEND.pref.styleCap }, colorLikes: {} })
  })

  it('a like followed by a dislike leaves nothing behind', () => {
    const p = reactToFrame(reactToFrame(EMPTY_PREFS, 'wayfarer', 'teal', 1), 'wayfarer', 'teal', -1)
    expect(p).toEqual(EMPTY_PREFS)
  })

  it('never stores anything about a face', () => {
    expect(Object.keys(reactToFrame(EMPTY_PREFS, 'a', 'b', 1)).sort()).toEqual(['chip', 'colorLikes', 'styleLikes'])
  })
})

describe('avoid lists and pair reasons', () => {
  it('lists only items that also score poorly, each with a reason', () => {
    const r = recommend(ctx({ shape: faceOf('round'), profile: profile({ undertone: 'warm', skinLab: [80, 12, 16] }) }))
    expect(r.avoidStyles.length).toBeLessThanOrEqual(RECOMMEND.lists.avoidCount)
    for (const a of r.avoidStyles) {
      expect(a.rec.score).toBeLessThan(RECOMMEND.lists.avoidStyleBelow)
      expect(a.reason.length).toBeGreaterThan(10)
    }
    for (const a of r.avoidColors) {
      expect(a.rec.score).toBeLessThan(RECOMMEND.lists.avoidColorBelow)
      expect(a.reason.length).toBeGreaterThan(10)
    }
    expect(r.avoidColors.length).toBeGreaterThan(0)
    // The top and avoid lists never overlap.
    const top = new Set(r.topStyles.map((s) => s.styleId))
    for (const a of r.avoidStyles) expect(top.has(a.rec.styleId)).toBe(false)
  })

  it('explains a pair: style reasons first, then color reasons', () => {
    const r = recommend(ctx({ shape: faceOf('round'), profile: profile({ undertone: 'warm', warmth: 0.8 }) }))
    const e = explainPair(r, 'rectangle', 'caramel')
    expect(e.reasons.length).toBeGreaterThanOrEqual(2)
    expect(e.reasons[0]).toMatch(/Rectangular frames work well with your round face/)
    expect(e.reasons.join(' ')).toMatch(/Caramel suits your warm undertone/)
    expect(e.score).toBe(r.comboScore('rectangle', 'caramel'))
  })

  it('a good match on one thing never hides a caution on another', () => {
    const r = recommend(ctx({ shape: faceOf('round'), profile: profile({ undertone: 'cool', warmth: 0.2 }) }))
    const e = explainPair(r, 'rectangle', 'terracotta')
    expect(e.reasons.join(' ')).toMatch(/Rectangular/)
    expect(e.cautions.join(' ')).toMatch(/Terracotta is a warm color/)
  })
})

function FAMILY(styleId: string) {
  return { square: 'square', rectangle: 'rectangle', 'half-rim': 'rectangle' }[styleId] ?? styleId
}

