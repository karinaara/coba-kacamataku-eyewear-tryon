// FaceMesh (478-point) index map. Pure data + helpers, no DOM.
//
// Left/right are from the SUBJECT's point of view (the subject's right eye is on the
// left side of an un-mirrored image). Verified in M1 against the library's canonical
// connection sets (see landmarks.test.ts) and the live index overlay.

export type Point3 = { x: number; y: number; z: number }

/** Named single landmarks used by measurements (brief section 5.3). */
export const LM = {
  faceTop: 10, // top of the mesh, BELOW the true hairline
  chin: 152,

  // Widest outline points at cheekbone height.
  cheekRight: 234,
  cheekLeft: 454,

  // Forehead: 54/284 are on the face oval. The brief's 71/301 are NOT (they sit inside
  // the oval, on the forehead surface), so 54/284 are the primary pair.
  foreheadRight: 54,
  foreheadLeft: 284,

  // Jaw angle: 172/397 and 58/288 are both on the face oval; 172/397 sit lower, closer to the chin.
  jawRight: 172,
  jawLeft: 397,
  jawHighRight: 58,
  jawHighLeft: 288,

  // Eyes (subject's right = image-left).
  eyeRightOuter: 33,
  eyeRightInner: 133,
  eyeLeftOuter: 263,
  eyeLeftInner: 362,
  irisRight: 468,
  irisLeft: 473,

  noseBridge: 168,
  noseTip: 1,
  noseWingRight: 98,
  noseWingLeft: 327,

  mouthRight: 61,
  mouthLeft: 291,
} as const

/** Eye opening outlines, 16 points each (the library's FACE_LANDMARKS_*_EYE sets; checked in a test). */
export const EYE_CONTOUR_RIGHT = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] as const
export const EYE_CONTOUR_LEFT = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398] as const
/** Iris outline points around each center (468 right, 473 left). */
export const IRIS_RING_RIGHT = [469, 470, 471, 472] as const
export const IRIS_RING_LEFT = [474, 475, 476, 477] as const

export type LandmarkName = keyof typeof LM

/** Index -> name for the landmarks above (for overlay labels). */
export const LM_NAME_BY_INDEX: ReadonlyMap<number, LandmarkName> = new Map(
  (Object.entries(LM) as [LandmarkName, number][]).map(([name, i]) => [i, name]),
)

export const KEY_INDICES: readonly number[] = [...new Set(Object.values(LM))]

/** Index into a landmark array; throws instead of returning undefined. */
export function lmAt(landmarks: readonly Point3[], i: number): Point3 {
  const p = landmarks[i]
  if (!p) throw new Error(`Landmark ${i} is missing (got ${landmarks.length} landmarks)`)
  return p
}

export function dist2D(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function dist3D(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function midpoint(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
}
