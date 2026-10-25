import { describe, expect, it } from 'vitest'
import { COLOR } from './config/color'
import { labToRgb, rgbToLab } from './color'
import { analyzeColor, blendWarmth, contrastFrom, depthFromIta, hueOf, ita, selfWarmth, undertoneFromWarmth, warmthFromHue, type UndertoneAnswers } from './colorProfile'
import { paintFace, scaled, type FaceColors, type RGB } from './testing/paintFace'

const lab = (L: number, a: number, b: number): RGB => labToRgb(L, a, b)
const dE = (p: readonly number[], q: readonly number[]) => Math.hypot((p[0] as number) - (q[0] as number), (p[1] as number) - (q[1] as number), (p[2] as number) - (q[2] as number))

const BASE: FaceColors = {
  skin: lab(62, 15, 18),
  hair: [25, 20, 18],
  iris: [70, 45, 30],
  sclera: [235, 230, 225],
  background: [120, 130, 140],
}

// Painting a 640 px picture is the slow part, so identical colors are painted once.
const painted = new Map<string, ReturnType<typeof paintFace>>()
function run(over: Partial<FaceColors> = {}, opts = {}, quality?: Parameters<typeof analyzeColor>[0]['quality']) {
  const key = JSON.stringify(over)
  let face = painted.get(key)
  if (!face) {
    face = paintFace({ ...BASE, ...over })
    painted.set(key, face)
  }
  return analyzeColor({ landmarks: face.landmarks, image: face.image, quality }, opts)
}
const must = <T>(v: T | null): T => {
  expect(v).not.toBeNull()
  return v as T
}

describe('ITA and depth', () => {
  it('matches the formula', () => {
    expect(ita(70, 10)).toBeCloseTo(63.43, 1) // atan(2)
    expect(ita(30, 20)).toBeCloseTo(-45, 1)
    expect(ita(50, 15)).toBeCloseTo(0, 6)
  })

  it('uses the brief\'s band edges', () => {
    expect(depthFromIta(56)).toBe('very-light')
    expect(depthFromIta(55)).toBe('very-light') // lower edge of the band
    expect(depthFromIta(41)).toBe('light')
    expect(depthFromIta(28)).toBe('intermediate')
    expect(depthFromIta(10)).toBe('tan')
    expect(depthFromIta(-30)).toBe('brown')
    expect(depthFromIta(-31)).toBe('dark')
  })
})

describe('skin color through the whole pipeline', () => {
  it('recovers a known skin color from the painted face', () => {
    const p = must(run())
    expect(dE(p.skinLab, rgbToLab(...BASE.skin))).toBeLessThan(2.5)
    expect(p.skinHex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it.each([
    [75, 15, 'very-light'],
    [65, 17, 'light'],
    [60, 17, 'intermediate'],
    [55, 20, 'tan'],
    [45, 20, 'brown'],
    [30, 15, 'dark'],
  ] as const)('L*=%d b*=%d reads as %s', (L, b, depth) => {
    const p = must(run({ skin: lab(L, 14, b) }))
    expect(p.depth).toBe(depth)
  })

  it('finds nothing to measure in a picture with no skin-colored pixels', () => {
    expect(run({ skin: [128, 128, 128], hair: [128, 128, 128], background: [128, 128, 128] })).toBeNull()
  })

  it('ignores the hair above and the iris/sclera inside: skin is unchanged when those change', () => {
    const a = must(run())
    const b = must(run({ hair: [230, 220, 90], iris: [20, 40, 160], sclera: [250, 250, 250] }))
    expect(dE(a.skinLab, b.skinLab)).toBeLessThan(0.5)
  })
})

describe('undertone from hue', () => {
  const atHue = (h: number) => {
    const C = 22
    return lab(60, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180))
  }

  it('maps hue to a warmth score and labels', () => {
    expect(hueOf(10, 10)).toBeCloseTo(45, 6)
    expect(warmthFromHue(COLOR.undertone.rampLowDeg - 5)).toBe(0)
    expect(warmthFromHue(COLOR.undertone.rampHighDeg + 5)).toBe(1)
    expect(undertoneFromWarmth(warmthFromHue(40))).toBe('cool')
    expect(undertoneFromWarmth(warmthFromHue(53))).toBe('neutral')
    expect(undertoneFromWarmth(warmthFromHue(66))).toBe('warm')
  })

  it('labels the painted face cool, neutral, warm as the hue rises, with rising warmth', () => {
    const pk = must(run({ skin: atHue(40) }))
    const pn = must(run({ skin: atHue(53) }))
    const pw = must(run({ skin: atHue(66) }))
    expect([pk.undertone, pn.undertone, pw.undertone]).toEqual(['cool', 'neutral', 'warm'])
    expect(pk.warmth).toBeLessThan(pn.warmth)
    expect(pn.warmth).toBeLessThan(pw.warmth)
  })

  it('says "close to neutral" for a label near a band edge, and nothing when well inside', () => {
    const { coolMaxHueDeg: c, warmMinHueDeg: w } = COLOR.undertone
    const nearCool = must(run({ skin: atHue(c - 0.8) }))
    expect([nearCool.undertone, nearCool.undertoneNear]).toEqual(['cool', 'neutral'])
    const nearWarm = must(run({ skin: atHue(w + 0.8) }))
    expect([nearWarm.undertone, nearWarm.undertoneNear]).toEqual(['warm', 'neutral'])
    // A neutral label points at whichever edge it is closer to.
    const neutralLowSide = must(run({ skin: atHue(c + 0.8) }))
    expect([neutralLowSide.undertone, neutralLowSide.undertoneNear]).toEqual(['neutral', 'cool'])
    const neutralHighSide = must(run({ skin: atHue(w - 0.8) }))
    expect([neutralHighSide.undertone, neutralHighSide.undertoneNear]).toEqual(['neutral', 'warm'])
    expect(must(run({ skin: atHue(c - 10) })).undertoneNear).toBeNull()
    expect(must(run({ skin: atHue((c + w) / 2) })).undertoneNear).toBeNull()
  })

  it('does not call a borderline label shaky once the user\'s answers are blended in', () => {
    const { coolMaxHueDeg: c } = COLOR.undertone
    const withAnswers = must(run({ skin: atHue(c - 0.8) }, { answers: { veins: 'blue', jewelry: 'silver', sun: 'burn' } }))
    expect(withAnswers.answersApplied).toBe(true)
    expect(withAnswers.undertoneNear).toBeNull()
  })

  it('is less sure of a label on a band edge than well inside it', () => {
    const edge = must(run({ skin: atHue(COLOR.undertone.coolMaxHueDeg - 0.5) }))
    const inside = must(run({ skin: atHue(COLOR.undertone.coolMaxHueDeg - 10) }))
    expect(inside.undertoneConfidence).toBeGreaterThan(edge.undertoneConfidence)
    // A neutral label is surest mid-band.
    const mid = must(run({ skin: atHue((COLOR.undertone.coolMaxHueDeg + COLOR.undertone.warmMinHueDeg) / 2) }))
    const nearEdge = must(run({ skin: atHue(COLOR.undertone.warmMinHueDeg - 0.5) }))
    expect(mid.undertoneConfidence).toBeGreaterThan(nearEdge.undertoneConfidence)
  })
})

describe('hair, eyes and contrast', () => {
  it('reads hair, iris and eye white at their painted colors', () => {
    const p = must(run())
    expect(dE(must(p.hairLab ?? null), rgbToLab(...BASE.hair))).toBeLessThan(3)
    expect(dE(must(p.eyeLab ?? null), rgbToLab(...BASE.iris))).toBeLessThan(4)
    expect(dE(must(p.scleraLab ?? null), rgbToLab(...BASE.sclera))).toBeLessThan(3)
    expect(p.hairSource).toBe('sampled')
    expect(p.contrastBasis).toBe('hair+eyes')
  })

  it('refuses to use a "hair" box that looks like skin (bald, short, high hairline)', () => {
    const p = must(run({ hair: BASE.skin }))
    expect(p.hairSource).toBe('skin-like')
    expect(p.hairLab).toBeUndefined()
    expect(p.contrastBasis).toBe('eyes')
  })

  it('keeps black hair on deep skin as hair (it is not mistaken for a bald scalp)', () => {
    const p = must(run({ skin: lab(32, 12, 13), hair: [18, 14, 12], iris: [40, 28, 20] }))
    expect(p.hairSource).toBe('sampled')
    expect(p.contrastBasis).toBe('hair+eyes')
  })

  it('a head covering switches contrast to the eyes only', () => {
    const open = must(run())
    const covered = must(run({}, { headCovered: true }))
    expect(covered.hairSource).toBe('covered')
    expect(covered.hairLab).toBeUndefined()
    expect(covered.contrastBasis).toBe('eyes')
    expect(open.contrastBasis).toBe('hair+eyes')
  })

  it('contrast thresholds and weights', () => {
    expect(contrastFrom(60, 55, 52).contrast).toBe('low')
    expect(contrastFrom(60, 20, 30).contrast).toBe('high') // 0.7 * 40 + 0.3 * 30 = 37
    expect(contrastFrom(60, 25, 30).contrast).toBe('medium') // 0.7 * 35 + 0.3 * 30 = 33.5, just under the cut-off
    expect(contrastFrom(60, 38, 38).contrast).toBe('medium')
    const both = contrastFrom(60, 20, 40)
    expect(both.delta).toBeCloseTo(COLOR.contrast.hairWeight * 40 + (1 - COLOR.contrast.hairWeight) * 20, 9)
    expect(contrastFrom(60, null, 30)).toMatchObject({ basis: 'eyes', delta: 30 })
    expect(contrastFrom(60, null, null)).toMatchObject({ contrast: null, basis: 'none', delta: null })
  })

  it('high contrast for dark hair on light skin, low for light hair on light skin', () => {
    expect(must(run({ skin: lab(75, 12, 15), hair: [20, 15, 12], iris: [50, 35, 25] })).contrast).toBe('high')
    expect(must(run({ skin: lab(75, 12, 15), hair: lab(68, 8, 25), iris: lab(65, 0, -10) })).contrast).toBe('low')
  })
})

describe('confidence', () => {
  it('is High for an evenly lit, neutral-balance photo', () => {
    const p = must(run())
    expect(p.confidenceLevel).toBe('High')
    expect(p.confidence).toBeGreaterThan(COLOR.confidence.high)
    expect(p.warnings).toEqual([])
  })

  it('falls as the picture gets darker, and says why (low light lowers confidence)', () => {
    const levels = [1, 0.7, 0.5, 0.35].map((f) => must(run({ skin: scaled(BASE.skin, f) })).confidence)
    // Flat while the skin stays in the "good light" range, then strictly down once it is outside it.
    for (let i = 1; i < levels.length; i++) expect(levels[i]!).toBeLessThanOrEqual(levels[i - 1]!)
    expect(levels[2]!).toBeLessThan(levels[0]!)
    expect(levels[3]!).toBeLessThan(levels[2]!)
    const dark = must(run({ skin: scaled(BASE.skin, 0.35) }))
    expect(dark.confidenceLevel).toBe('Low')
    expect(dark.warnings.join(' ')).toMatch(/dark/)
  })

  it('falls when the picture is over-exposed', () => {
    const bright = must(run({ skin: lab(92, 8, 12) }))
    expect(bright.confidence).toBeLessThan(must(run()).confidence)
    expect(bright.warnings.join(' ')).toMatch(/bright/)
  })

  it('falls when the cheeks are lit differently', () => {
    const uneven = must(run({ skinOtherSide: lab(82, 15, 18) }))
    expect(uneven.debug.skin.deltaL).toBeGreaterThan(10)
    expect(uneven.factors.agreement).toBeLessThan(0.9)
    expect(uneven.confidence).toBeLessThan(must(run()).confidence)
    expect(uneven.warnings.join(' ')).toMatch(/cheek/)
  })

  it('falls with a colour cast seen in the eye white', () => {
    const tinted = must(run({ sclera: [255, 200, 130] }))
    expect(tinted.debug.castMagnitude).toBeGreaterThan(20)
    expect(tinted.factors.cast).toBeLessThan(0.7)
    expect(tinted.confidence).toBeLessThan(must(run()).confidence)
    expect(tinted.warnings.join(' ')).toMatch(/tint/)
  })

  it('counts glasses and blown-out pixels from the quality report', () => {
    const q = { checks: [], ready: true, pose: null, metrics: { edgeEnergy: 0.3, clipped: 0.05, crushed: 0 } }
    const p = must(run({}, {}, q))
    expect(p.factors.glasses).toBeLessThan(1)
    expect(p.factors.clipping).toBeLessThan(1)
    expect(p.confidence).toBeLessThan(must(run()).confidence)
  })

  it('is a product of its factors, never below the floor', () => {
    const p = must(run({ skin: scaled(BASE.skin, 0.3), skinOtherSide: lab(85, 15, 18), sclera: [255, 190, 100] }))
    const product = Object.values(p.factors).reduce((a, b) => a * b, 1)
    expect(p.confidence).toBeCloseTo(Math.max(0.05, product), 9)
    expect(p.confidence).toBeGreaterThanOrEqual(0.05)
  })

  it('does not apply the sclera white-balance correction while its strength is 0', () => {
    expect(COLOR.correction.strength).toBe(0)
    const p = must(run({ sclera: [255, 200, 130] }))
    expect(p.debug.appliedShift).toEqual([0, 0])
    expect(p.skinLab).toEqual(p.debug.rawSkinLab)
  })
})

describe('confirm your undertone', () => {
  const allCool: UndertoneAnswers = { veins: 'blue', jewelry: 'silver', sun: 'burn' }
  const allWarm: UndertoneAnswers = { veins: 'green', jewelry: 'gold', sun: 'tan' }
  const unsure: UndertoneAnswers = { veins: 'unsure', jewelry: 'unsure', sun: 'unsure' }

  it('scores the answers and ignores "not sure"', () => {
    expect(selfWarmth(allCool)).toEqual({ warmth: 0, answered: 3 })
    expect(selfWarmth(allWarm)).toEqual({ warmth: 1, answered: 3 })
    expect(selfWarmth({ veins: 'blue', jewelry: 'gold', sun: 'unsure' })).toEqual({ warmth: 0.5, answered: 2 })
    expect(selfWarmth(unsure)).toBeNull()
  })

  it('leaves the measurement alone when nothing is answered', () => {
    expect(blendWarmth(0.8, 0.3, unsure)).toEqual({ warmth: 0.8, weight: 0 })
    expect(blendWarmth(0.8, 0.3, null)).toEqual({ warmth: 0.8, weight: 0 })
  })

  it('pulls toward the answers, more when the photo is less sure, but never fully', () => {
    const sure = blendWarmth(0.9, 0.95, allCool)
    const unsureP = blendWarmth(0.9, 0.2, allCool)
    expect(sure.warmth).toBeLessThan(0.9)
    expect(unsureP.warmth).toBeLessThan(sure.warmth)
    expect(sure.weight).toBeCloseTo(COLOR.confirm.minWeight, 9) // floor: answers always count a little
    expect(unsureP.weight).toBeCloseTo(COLOR.confirm.maxWeight, 9) // cap: measurement always counts a little
    expect(unsureP.warmth).toBeGreaterThan(0)
  })

  it('answering fewer questions counts for less', () => {
    const one = blendWarmth(0.9, 0.2, { veins: 'blue', jewelry: 'unsure', sun: 'unsure' })
    const three = blendWarmth(0.9, 0.2, allCool)
    expect(one.weight).toBeLessThan(three.weight)
  })

  it('can flip the label on a low-confidence photo and is reported in the profile', () => {
    const warmDark = { skin: scaled(lab(60, 8, 28), 0.4) }
    const measured = must(run(warmDark))
    expect(measured.confidenceLevel).toBe('Low')
    const withAnswers = must(run(warmDark, { answers: allCool }))
    expect(withAnswers.answersApplied).toBe(true)
    expect(withAnswers.warmth).toBeLessThan(measured.warmth)
    expect(withAnswers.measured.warmth).toBeCloseTo(measured.measured.warmth, 9) // measurement is kept visible
    expect(measured.answersApplied).toBe(false)
  })
})

