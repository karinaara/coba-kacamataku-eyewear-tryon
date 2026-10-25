// Quality gate (brief section 5.1). Pure: landmarks + pose matrix + downscaled pixels in, report out.

import { QUALITY as Q, type QualityMode } from './config/quality'
import { luma, mean, median, rgbToLab, type Lab } from './color'
import { LM, lmAt, type Point3 } from './landmarks'
import { poseFromMatrix, type Pose } from './pose'
import { roiHull, samplePixels, scaleHull, type ImageLike } from './roi'

export type CheckId =
  | 'centered'
  | 'faceSize'
  | 'pose'
  | 'lighting'
  | 'evenLighting'
  | 'hairOnForehead'
  | 'eyesOpen'
  | 'mouthClosed'
  | 'glasses'
  | 'colorCast'

export type CheckGroup = 'position' | 'lighting' | 'forehead' | 'expression' | 'extra'
export type CheckStatus = 'pass' | 'fail' | 'warn'

export interface CheckResult {
  id: CheckId
  group: CheckGroup
  status: CheckStatus
  /** Plain-language tip. Empty when the check passes. */
  tip: string
}

export interface QualityReport {
  checks: CheckResult[]
  /** True when no check has status "fail". In upload mode nothing fails, so this is always true. */
  ready: boolean
  pose: Pose | null
  /** Raw numbers for the debug panel. NaN/missing entries mean "could not be measured". */
  metrics: Record<string, number>
}

export interface QualityInput {
  landmarks: readonly Point3[]
  /** `facialTransformationMatrixes[0].data`, if available. */
  matrix: ArrayLike<number> | null
  /** Overrides `matrix` when the pose is already known (for example a median over frames). */
  pose?: Pose | null
  /** Downscaled RGBA pixels of the same frame. */
  image: ImageLike
}

const BLOCKING: ReadonlySet<CheckId> = new Set([
  'centered', 'faceSize', 'pose', 'lighting', 'evenLighting', 'hairOnForehead', 'eyesOpen', 'mouthClosed',
])

const GROUP_OF: Record<CheckId, CheckGroup> = {
  centered: 'position',
  faceSize: 'position',
  pose: 'position',
  lighting: 'lighting',
  evenLighting: 'lighting',
  hairOnForehead: 'forehead',
  eyesOpen: 'expression',
  mouthClosed: 'expression',
  glasses: 'extra',
  colorCast: 'extra',
}

// Right eye then left eye: [outer, upper-outer, upper-inner, inner, lower-inner, lower-outer].
const EYE_RING = [
  [33, 160, 158, 133, 153, 144],
  [362, 385, 387, 263, 373, 380],
] as const

const distPx = (a: Point3, b: Point3, w: number, h: number) => Math.hypot((a.x - b.x) * w, (a.y - b.y) * h)

export function faceBox(lm: readonly Point3[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of lm) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, h: maxY - minY }
}

/** Mean eye aspect ratio of both eyes (about 0.3 open, near 0 closed). Distances are in pixels. */
export function eyeAspectRatio(lm: readonly Point3[], w: number, h: number): number {
  const ears = EYE_RING.map(([p1, p2, p3, p4, p5, p6]) => {
    const d = (a: number, b: number) => distPx(lmAt(lm, a), lmAt(lm, b), w, h)
    return (d(p2, p6) + d(p3, p5)) / (2 * d(p1, p4))
  })
  return mean(ears)
}

/** Inner-lip gap divided by face height (mesh top to chin). */
export function mouthOpenRatio(lm: readonly Point3[], w: number, h: number): number {
  const gap = distPx(lmAt(lm, 13), lmAt(lm, 14), w, h)
  return gap / distPx(lmAt(lm, LM.faceTop), lmAt(lm, LM.chin), w, h)
}

/** Mean absolute vertical luma gradient (0..1) in a band across the nose bridge. Glasses frames add edges there. */
export function bridgeEdgeEnergy(lm: readonly Point3[], img: ImageLike): number {
  const a = lmAt(lm, LM.eyeRightInner)
  const b = lmAt(lm, LM.eyeLeftInner)
  const c = lmAt(lm, LM.noseBridge)
  const span = Math.abs(b.x - a.x)
  const x0 = Math.max(1, Math.floor(Math.min(a.x, b.x) * img.width))
  const x1 = Math.min(img.width - 2, Math.ceil(Math.max(a.x, b.x) * img.width))
  const y0 = Math.max(1, Math.floor((c.y - span * 0.5) * img.height))
  const y1 = Math.min(img.height - 2, Math.ceil((c.y + span * 0.5) * img.height))
  const L = (x: number, y: number) => {
    const i = (y * img.width + x) * 4
    return luma(Number(img.data[i]), Number(img.data[i + 1]), Number(img.data[i + 2]))
  }
  let sum = 0
  let n = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      sum += Math.abs(L(x, y + 1) - L(x, y - 1)) / 255
      n++
    }
  }
  return n ? sum / n : NaN
}

function frameChroma(img: ImageLike): number {
  const a: number[] = []
  const b: number[] = []
  const step = 4
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 4
      const lab = rgbToLab(Number(img.data[i]), Number(img.data[i + 1]), Number(img.data[i + 2]))
      a.push(lab[1])
      b.push(lab[2])
    }
  }
  return Math.hypot(mean(a), mean(b))
}

const labDistance = (p: Lab, q: Lab, lWeight: number) =>
  Math.hypot((p[0] - q[0]) * lWeight, p[1] - q[1], p[2] - q[2])

export function evaluateQuality(input: QualityInput, mode: QualityMode = 'camera'): QualityReport {
  const { landmarks: lm, image: img } = input
  const w = img.width
  const h = img.height
  const metrics: Record<string, number> = {}
  const results: { id: CheckId; ok: boolean; tip: string }[] = []
  const add = (id: CheckId, ok: boolean, tip: string) => results.push({ id, ok, tip })

  // Position: centered, size, inside the frame.
  const box = faceBox(lm)
  metrics.faceHeight = box.h
  metrics.offsetX = box.cx - 0.5
  metrics.offsetY = box.cy - 0.5
  const inside =
    box.minX >= Q.edgeMargin && box.maxX <= 1 - Q.edgeMargin && box.minY >= Q.edgeMargin && box.maxY <= 1 - Q.edgeMargin
  const centered =
    inside && Math.abs(metrics.offsetX) <= Q.centerTolerance.x && Math.abs(metrics.offsetY) <= Q.centerTolerance.y
  add('centered', centered, 'Center your face in the oval and keep all of it in the frame.')
  const sizeOk = box.h >= Q.faceHeightFrac.min && box.h <= Q.faceHeightFrac.max
  add('faceSize', sizeOk, box.h < Q.faceHeightFrac.min ? 'Move a little closer.' : 'Move back a little.')

  // Pose.
  const pose = input.pose !== undefined ? input.pose : input.matrix ? poseFromMatrix(input.matrix) : null
  if (pose) {
    metrics.yaw = pose.yaw
    metrics.pitch = pose.pitch
    metrics.roll = pose.roll
    const turned = Math.abs(pose.yaw) > Q.pose.maxYawDeg
    const nodded = Math.abs(pose.pitch) > Q.pose.maxPitchDeg
    const tilted = Math.abs(pose.roll) > Q.pose.maxRollDeg
    add(
      'pose',
      !turned && !nodded && !tilted,
      turned ? 'Face the camera straight on.' : nodded ? 'Keep your chin level, not up or down.' : 'Keep your head upright, not tilted.',
    )
  }

  // Lighting, from the cheeks only (hair and fabric would skew the forehead).
  const rcPx = samplePixels(img, scaleHull(roiHull(lm, 'rightCheek'), w, h))
  const lcPx = samplePixels(img, scaleHull(roiHull(lm, 'leftCheek'), w, h))
  const cheekPx = [...rcPx, ...lcPx]
  const labOf = (px: typeof cheekPx) => px.map((p) => rgbToLab(p.r, p.g, p.b))
  if (rcPx.length < Q.minRoiPixels || lcPx.length < Q.minRoiPixels) {
    add('lighting', false, "We can't see your cheeks clearly. Face the camera and make sure they are lit.")
  } else {
    const rcLab = labOf(rcPx)
    const lcLab = labOf(lcPx)
    const meanL = mean([...rcLab, ...lcLab].map((l) => l[0]))
    const lumas = cheekPx.map((p) => luma(p.r, p.g, p.b))
    const clipped = lumas.filter((v) => v > Q.lighting.clippedAbove).length / lumas.length
    const crushed = lumas.filter((v) => v < Q.lighting.crushedBelow).length / lumas.length
    metrics.meanL = meanL
    metrics.clipped = clipped
    metrics.crushed = crushed
    const tooDark = meanL < Q.lighting.meanLMin || crushed > Q.lighting.maxCrushedFrac
    const tooBright = meanL > Q.lighting.meanLMax || clipped > Q.lighting.maxClippedFrac
    add(
      'lighting',
      !tooDark && !tooBright,
      tooDark ? 'It is too dark. Face a window or a lamp.' : 'It is too bright. Move out of direct light.',
    )
    const dL = Math.abs(median(rcLab.map((l) => l[0])) - median(lcLab.map((l) => l[0])))
    metrics.deltaL = dL
    add('evenLighting', dL <= Q.evenLighting.maxDeltaL, 'One side of your face is brighter. Face the light directly.')

    // Forehead: how much of the region looks like the same skin as the cheeks.
    const cheekLab = [...rcLab, ...lcLab]
    const ref: Lab = [
      median(cheekLab.map((l) => l[0])),
      median(cheekLab.map((l) => l[1])),
      median(cheekLab.map((l) => l[2])),
    ]
    const fhPx = samplePixels(img, scaleHull(roiHull(lm, 'forehead'), w, h))
    if (fhPx.length < Q.minRoiPixels) {
      add('hairOnForehead', false, 'We can\'t see your forehead. Keep it clear of hair or fabric.')
    } else {
      const skin = fhPx.filter((p) => labDistance(rgbToLab(p.r, p.g, p.b), ref, Q.forehead.lWeight) <= Q.forehead.maxDistance).length
      const ratio = skin / fhPx.length
      metrics.skinRatio = ratio
      add('hairOnForehead', ratio >= Q.forehead.minSkinRatio, 'Keep your forehead clear of hair or fabric.')
    }
  }

  // Expression.
  const ear = eyeAspectRatio(lm, w, h)
  metrics.ear = ear
  add('eyesOpen', ear >= Q.eyes.minEar, 'Open your eyes fully and look at the camera.')
  const mouth = mouthOpenRatio(lm, w, h)
  metrics.mouth = mouth
  add('mouthClosed', mouth <= Q.mouth.maxOpenRatio, 'Relax your mouth and keep it closed.')

  // Warn-only extras.
  const edge = bridgeEdgeEnergy(lm, img)
  metrics.edgeEnergy = edge
  add('glasses', !(edge > Q.glasses.maxEdgeEnergy), 'It looks like you may be wearing glasses. Take them off for the best result.')
  const chroma = frameChroma(img)
  metrics.castChroma = chroma
  add('colorCast', chroma <= Q.colorCast.maxChroma, 'The picture has a strong color tint. Try neutral, white light.')

  const checks: CheckResult[] = results.map(({ id, ok, tip }) => ({
    id,
    group: GROUP_OF[id],
    status: ok ? 'pass' : mode === 'camera' && BLOCKING.has(id) ? 'fail' : 'warn',
    tip: ok ? '' : tip,
  }))
  return { checks, ready: checks.every((c) => c.status !== 'fail'), pose, metrics }
}

/**
 * Cheap per-frame test used while collecting capture frames: pose and blink only, no pixels.
 * Frames that fail are skipped (a blink or a head turn would spoil the median).
 */
export function isFrameUsable(lm: readonly Point3[], matrix: ArrayLike<number> | null, w: number, h: number): boolean {
  if (eyeAspectRatio(lm, w, h) < Q.eyes.minEar) return false
  const pose = matrix ? poseFromMatrix(matrix) : null
  if (pose) {
    if (Math.abs(pose.yaw) > Q.pose.maxYawDeg) return false
    if (Math.abs(pose.pitch) > Q.pose.maxPitchDeg) return false
    if (Math.abs(pose.roll) > Q.pose.maxRollDeg) return false
  }
  return true
}

export interface GroupSummary {
  group: Exclude<CheckGroup, 'extra'>
  label: string
  status: CheckStatus
  /** The first tip among failing checks in this group, or '' when the group passes. */
  tip: string
}

const GROUP_LABELS: Record<Exclude<CheckGroup, 'extra'>, string> = {
  position: 'Centered and facing the camera',
  lighting: 'Good, even lighting',
  forehead: 'Forehead is clear',
  expression: 'Eyes open, relaxed mouth',
}

/** Collapses the checks into the four checklist rows from screen 2, plus the warn-only extras. */
export function summarizeReport(report: QualityReport) {
  const groups = (Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[]).map((group): GroupSummary => {
    const own = report.checks.filter((c) => c.group === group)
    const failing = own.find((c) => c.status === 'fail') ?? own.find((c) => c.status === 'warn')
    return { group, label: GROUP_LABELS[group], status: failing?.status ?? 'pass', tip: failing?.tip ?? '' }
  })
  const extras = report.checks.filter((c) => c.group === 'extra' && c.status !== 'pass')
  return { groups, extras }
}
