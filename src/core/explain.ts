// "Why this?" content: the real measurements and the rule that produced the shape. Pure.

import { MEASURE } from './config/measure'
import { PROTOTYPES, WHY_SCALES, type ChinCategory, type FaceShape, type NumericFeature } from './config/faceShapes'
import { bestChinCategory, type FaceShapeResult, type ShapeInput } from './faceShape'

export const SHAPE_LABEL: Record<FaceShape, string> = {
  oval: 'Oval',
  round: 'Round',
  square: 'Square',
  oblong: 'Oblong',
  heart: 'Heart',
  diamond: 'Diamond',
}

export type Closeness = 'close' | 'near' | 'far'

export interface WhyRow {
  id: NumericFeature
  label: string
  /** Plain-language reading of the value. */
  reading: string
  value: number
  scale: { min: number; max: number }
  /** Where the primary and secondary shapes sit on the same axis. */
  markers: { shape: FaceShape; value: number }[]
  closeness: Closeness
}

export interface WhyThis {
  rows: WhyRow[]
  chin: { category: ChinCategory; angle: number; scale: { min: number; max: number }; matches: boolean; expected: ChinCategory }
  /** One sentence per rule that fired, in plain English. */
  reasons: string[]
  notes: string[]
}

const closenessOf = (z: number): Closeness => (Math.abs(z) < 0.75 ? 'close' : Math.abs(z) < 1.5 ? 'near' : 'far')
const CLOSE_WORD: Record<Closeness, string> = { close: 'a close match', near: 'a fairly close match', far: 'a weak match' }
const pct = (v: number) => `${Math.round(v * 100)}%`

export function explainFaceShape(m: ShapeInput, r: FaceShapeResult): WhyThis {
  const proto = PROTOTYPES[r.primary]
  const second = PROTOTYPES[r.secondary]
  const dev = r.deviations[r.primary]
  const markers = (f: NumericFeature) => [
    { shape: r.primary, value: proto[f] },
    { shape: r.secondary, value: second[f] },
  ]

  const rows: WhyRow[] = [
    {
      id: 'lengthToWidth',
      label: 'Length vs width',
      reading: `${m.lengthToWidth.toFixed(2)} times as long as wide`,
      value: m.lengthToWidth,
      scale: WHY_SCALES.lengthToWidth,
      markers: markers('lengthToWidth'),
      closeness: closenessOf(dev.lengthToWidth),
    },
    {
      id: 'foreheadToCheek',
      label: 'Forehead vs cheekbones',
      reading: `${pct(m.foreheadToCheek)} as wide as your cheekbones`,
      value: m.foreheadToCheek,
      scale: WHY_SCALES.foreheadToCheek,
      markers: markers('foreheadToCheek'),
      closeness: closenessOf(dev.foreheadToCheek),
    },
    {
      id: 'jawToCheek',
      label: 'Jaw vs cheekbones',
      reading: `${pct(m.jawToCheek)} as wide as your cheekbones`,
      value: m.jawToCheek,
      scale: WHY_SCALES.jawToCheek,
      markers: markers('jawToCheek'),
      closeness: closenessOf(dev.jawToCheek),
    },
  ]

  const category = bestChinCategory(r.chin)
  const chin = {
    category,
    angle: m.chinAngle,
    scale: WHY_SCALES.chinAngle,
    matches: r.chin[proto.chin] >= 0.5,
    expected: proto.chin,
  }

  const P = SHAPE_LABEL[r.primary]
  const S = SHAPE_LABEL[r.secondary]
  const reasons = [
    `Your face is ${m.lengthToWidth.toFixed(2)} times as long as it is wide. ${P} is about ${proto.lengthToWidth.toFixed(2)}, ${S} about ${second.lengthToWidth.toFixed(2)}. That is ${CLOSE_WORD[rows[0]!.closeness]} for ${P}.`,
    `Your forehead is ${pct(m.foreheadToCheek)} as wide as your cheekbones (${P}: ${pct(proto.foreheadToCheek)}, ${S}: ${pct(second.foreheadToCheek)}), ${CLOSE_WORD[rows[1]!.closeness]}.`,
    `Your jaw is ${pct(m.jawToCheek)} as wide as your cheekbones (${P}: ${pct(proto.jawToCheek)}, ${S}: ${pct(second.jawToCheek)}), ${CLOSE_WORD[rows[2]!.closeness]}.`,
    chin.matches
      ? `Your chin reads as ${category}, which fits ${P}.`
      : `Your chin reads as ${category}, while ${P} usually has a ${proto.chin} chin. This pulled the score down a little.`,
  ]

  const notes = [
    `Face length uses an estimated hairline (the mesh top plus ${Math.round((MEASURE.hairlineExtension - 1) * 100)}%), because a camera cannot see where your hair really starts. This is a rough guess, so length is the least certain number.`,
    'These are style suggestions based on proportions, not rules. Faces sit on a spectrum, so treat the second shape as just as valid.',
  ]
  return { rows, chin, reasons, notes }
}
