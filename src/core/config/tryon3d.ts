// [tune] 3D try-on (stretch after M9). Starting values, not validated on real heads: only checked on one frontal
// photo and on synthetic rotations of it. Units: frame models are in millimeters; the scene is in picture pixels.

export const TRYON3D = {
  // Where the frame front sits in front of the iris landmarks, along the head's forward axis (mm).
  frontOffsetMm: 11,
  // The face-mesh occluder is pushed this far back (mm) so the cheeks do not cut into the rims. Only the nose,
  // which sticks out furthest, can then hide parts of the frame (the far lens at a turned head).
  faceMeshBackMm: 14,
  // Landmark smoothing for the head pose and the occluder (0 = frozen, 1 = no smoothing). Moves with the
  // head: the blend rises when the face moves fast, so it neither jitters when still nor lags when turning.
  smoothing: { minAlpha: 0.25, maxAlpha: 0.85, fastPxPerFrame: 12 },
  // Head pose: which landmarks give the sideways and the up direction.
  pose: {
    // Pairs [from, to] whose directions are added to get the head's sideways axis (subject's right -> left).
    sidewaysPairs: [
      [33, 263], // outer eye corners
      [133, 362], // inner eye corners
    ] as ReadonlyArray<readonly [number, number]>,
    upFrom: 152, // chin
    upTo: 10, // top of the face mesh
  },
  // The "skull" that hides the far temple and the back of the near one: an ellipsoid behind the face mesh.
  skull: {
    // Radii as multiples of the face width (cheekbone to cheekbone).
    // Narrower than the face on purpose: the temples sit just outside the head, so the near one stays visible.
    radiusX: 0.46,
    radiusY: 0.78,
    // Equal to centerBack, so the front tip of the ellipsoid is at the eye plane and never cuts into the lenses.
    radiusZ: 0.55,
    // How far behind the eye plane the center sits, as a multiple of the face width.
    centerBack: 0.55,
    // How far up from the eye line the center sits, as a multiple of the face width.
    centerUp: 0.1,
    segments: 24,
  },
  // Frame geometry (mm).
  model: {
    rimDepth: 5.5,
    rimDepthThin: 2.6,
    lensSamples: 28,
    // The temple runs straight back this far from the hinge, then bends down behind the ear.
    templeStraightMm: 112,
    templeBendMm: 36,
    templeDropMm: 24,
    templeRadius: { 'thin-metal': 1.0, straight: 1.5, 'thick-acetate': 2.6 } as const,
    templeHeight: { 'thin-metal': 1.0, straight: 1.0, 'thick-acetate': 2.6 } as const,
    bridgeRadius: 1.6,
  },
  // Lighting. The soft environment is generated in code, nothing is downloaded.
  light: { ambient: 0.55, key: 1.1, envIntensity: 0.9 },
  // Lens opacity per tint (lens color comes from the 2D palette in the generator).
  lens: {
    clear: { color: '#D6E6EE', opacity: 0.1 },
    'light-grey': { color: '#4B5563', opacity: 0.24 },
    'brown-gradient': { color: '#5A3A1E', opacity: 0.45 },
    dark: { color: '#0B1220', opacity: 0.86 },
  } as const,
}
