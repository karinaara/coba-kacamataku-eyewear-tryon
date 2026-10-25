// Where, how big, and at what angle a frame goes on a face (brief section 6.4). Pure.

import { FIT } from './config/tryon'
import { IRIS_RING_LEFT, IRIS_RING_RIGHT, LM, lmAt, type Point3 } from './landmarks'
import type { Vec2 } from './smoothing'

/** The landmarks the fit needs, in the same pixel space as the picture they will be drawn on. */
export interface FitPoints {
  irisRight: Vec2 // subject's right eye (image left, landmark 468)
  irisLeft: Vec2 // subject's left eye (image right, landmark 473)
  cheekRight: Vec2 // 234
  cheekLeft: Vec2 // 454
  bridge: Vec2 // 168
  noseTip: Vec2 // 1
  /** Iris diameter in picture pixels (the ruler for real-world sizes). 0 if unknown. */
  irisDiameterPx: number
}

export interface Placement {
  /** Where the frame's center (x = 0, lens middle) lands, in picture pixels. */
  cx: number
  cy: number
  /** Radians. In picture coordinates (y down), positive turns the frame clockwise. */
  rotation: number
  /** Picture pixels per frame unit, vertically. Horizontal is `scaleX`. */
  scaleY: number
  scaleX: number
  /** Horizontal squash of the temples (cos of yaw). */
  templeScale: number
  /** Opacity of the temple on the image-left and image-right side, 0..1. */
  leftTempleAlpha: number
  rightTempleAlpha: number
  /** Opacity of the frame front. */
  frontAlpha: number
  /** The width the frame front is drawn at, in picture pixels (before the yaw squash). */
  frontWidthPx: number
  /** Which ruler set the size. */
  scaleBasis: 'iris' | 'cheek'
}

/**
 * Iris diameter in pixels: the larger of the two opposite-point distances per eye, averaged over both
 * eyes. The larger one is used because a turned head squashes one diameter but not the other.
 */
export function irisDiameterPx(landmarks: readonly Point3[], width: number, height: number): number {
  const at = (i: number): Vec2 => {
    const p = lmAt(landmarks, i)
    return { x: p.x * width, y: p.y * height }
  }
  const eye = (ring: readonly [number, number, number, number]) =>
    Math.max(Math.hypot(at(ring[0]).x - at(ring[2]).x, at(ring[0]).y - at(ring[2]).y), Math.hypot(at(ring[1]).x - at(ring[3]).x, at(ring[1]).y - at(ring[3]).y))
  return (eye(IRIS_RING_RIGHT) + eye(IRIS_RING_LEFT)) / 2
}

/** Pulls the fit landmarks out of a full mesh and converts them to picture pixels. */
export function fitPointsFromLandmarks(landmarks: readonly Point3[], width: number, height: number): FitPoints {
  const at = (i: number): Vec2 => {
    const p = lmAt(landmarks, i)
    return { x: p.x * width, y: p.y * height }
  }
  return {
    irisDiameterPx: irisDiameterPx(landmarks, width, height),
    irisRight: at(LM.irisRight),
    irisLeft: at(LM.irisLeft),
    cheekRight: at(LM.cheekRight),
    cheekLeft: at(LM.cheekLeft),
    bridge: at(LM.noseBridge),
    noseTip: at(LM.noseTip),
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
const DEG = Math.PI / 180

/**
 * @param frontWidthUnits width of the frame front in frame units (`frame.frontBox.w`)
 * @param lensHeightUnits height of the frame front (`frame.frontBox.h`), used for the vertical offset
 * @param sizeFactor 0.94 / 1.0 / 1.06 for S / M / L
 * @param frameMm the frame front's real width in mm (for the iris ruler); null forces the cheek ruler
 * @param yawDeg head yaw magnitude in degrees (sign does not matter)
 */
export function computeFit(
  p: FitPoints,
  yawDeg: number,
  frontWidthUnits: number,
  lensHeightUnits: number,
  sizeFactor: number,
  frameMm: number | null = null,
  cfg = FIT,
): Placement {
  const yaw = Math.abs(yawDeg)
  const cosYaw = Math.max(cfg.yaw.minCos, Math.cos(yaw * DEG))

  // Eye line: the roll, and the axis the frame is centered along.
  const ex = p.irisLeft.x - p.irisRight.x
  const ey = p.irisLeft.y - p.irisRight.y
  const eyeLen = Math.hypot(ex, ey) || 1
  const u = { x: ex / eyeLen, y: ey / eyeLen }
  const rotation = Math.atan2(ey, ex)

  // Horizontal anchor: between the eye midpoint and the nose bridge projected onto the eye line.
  const mid = { x: (p.irisRight.x + p.irisLeft.x) / 2, y: (p.irisRight.y + p.irisLeft.y) / 2 }
  const along = (p.bridge.x - mid.x) * u.x + (p.bridge.y - mid.y) * u.y
  const shift = along * cfg.bridgeWeight

  // Size: the cheekbone width shrinks with yaw, so undo that for a uniform scale, then squash x by cos(yaw).
  const useIris = cfg.scaleBasis === 'iris' && frameMm !== null && p.irisDiameterPx >= cfg.minIrisPx
  const frontWidthPx = useIris
    ? frameMm * sizeFactor * (p.irisDiameterPx / cfg.irisMm) * cfg.frameScale
    : (dist(p.cheekRight, p.cheekLeft) / cosYaw) * cfg.fitFactor * sizeFactor
  const scaleY = frontWidthPx / frontWidthUnits
  const scaleX = scaleY * cosYaw

  // Vertical: lens middle on the eye line, optionally nudged along the face's own "down".
  const down = { x: -u.y, y: u.x }
  const drop = cfg.lensCenterOffset * lensHeightUnits * scaleY
  const cx = mid.x + u.x * shift + down.x * drop
  const cy = mid.y + u.y * shift + down.y * drop

  // Which temple is on the far side: the side the nose points toward (it is hidden behind the face).
  const faceMidX = (p.cheekRight.x + p.cheekLeft.x) / 2
  const farIsRight = p.noseTip.x - faceMidX > 0
  const far = 1 - clamp01((yaw - cfg.yaw.farTempleFadeStartDeg) / (cfg.yaw.farTempleHideDeg - cfg.yaw.farTempleFadeStartDeg))
  const near = 1 - clamp01((yaw - cfg.yaw.farTempleHideDeg) / cfg.yaw.nearTempleFadeSpanDeg)

  return {
    cx,
    cy,
    rotation,
    scaleX,
    scaleY,
    templeScale: cosYaw,
    leftTempleAlpha: farIsRight ? near : far,
    rightTempleAlpha: farIsRight ? far : near,
    frontAlpha: 1 - clamp01((yaw - cfg.yaw.frontFadeStartDeg) / (cfg.yaw.frontHideDeg - cfg.yaw.frontFadeStartDeg)),
    frontWidthPx,
    scaleBasis: useIris ? 'iris' : 'cheek',
  }
}
