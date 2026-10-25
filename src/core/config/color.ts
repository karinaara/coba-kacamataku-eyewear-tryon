// [tune] Skin / hair / eye color analysis (brief section 7). Every number is a STARTING VALUE.
// Nothing here has been calibrated on labeled photos; hue bands and confidence curves in particular
// are guesses and should be set from real photos (M8).

export const COLOR = {
  // The snapshot is downscaled to this width before sampling.
  sampleWidth: 640,

  skin: {
    // Plausible skin chroma window in CIELAB. Pixels outside (red lips, blue shirt, green wall) are ignored.
    aRange: [3, 38] as const,
    bRange: [4, 48] as const,
    // After the chroma window: drop speculars (brightest) and shadows (darkest) before taking medians.
    dropBrightestFrac: 0.1,
    dropDarkestFrac: 0.2,
    // A region with fewer usable pixels than this is ignored.
    minPixels: 60,
  },

  // Individual Typology Angle bands, degrees (brief 7.2). `min` is the lower edge of each band.
  itaBands: [
    { id: 'very-light', min: 55 },
    { id: 'light', min: 41 },
    { id: 'intermediate', min: 28 },
    { id: 'tan', min: 10 },
    { id: 'brown', min: -30 },
    { id: 'dark', min: -Infinity },
  ] as const,

  undertone: {
    // Hue angle h = atan2(b*, a*) in degrees. Below coolMax = cool (pinker), above warmMin = warm
    // (yellower), in between = neutral. Wide neutral band on purpose.
    coolMaxHueDeg: 49,
    warmMinHueDeg: 58,
    // Maps hue to a 0 (cool) .. 1 (warm) score for the on-screen indicator.
    rampLowDeg: 42,
    rampHighDeg: 66,
    // Distance from a band edge (degrees) at which a cool/warm label is fully trusted.
    marginSoftDeg: 6,
    // Below this margin (0 = on a band edge, 1 = well inside) a label is shown as "close to" its neighbour.
    borderlineMargin: 0.4,
  },

  hair: {
    // The sampling box sits above the mesh top, this fraction of the face length up (from, to).
    aboveFaceFrac: [0.03, 0.15] as const,
    minPixels: 60,
    dropBrightestFrac: 0.1,
    dropDarkestFrac: 0.1,
    // If the "hair" box looks like skin (bald, short or high hairline) it is not used.
    // Kept small on purpose: black hair on deep skin is also a small distance, and must not be mistaken for a bald scalp.
    skinLikeDistance: 9,
  },

  eye: {
    // Iris ring, as fractions of the iris radius.
    ringInner: 0.45,
    ringOuter: 0.9,
    dropBrightestFrac: 0.2, // catchlights
    dropDarkestFrac: 0.15, // pupil edge, lashes
    minPixels: 10,
  },

  sclera: {
    // Pixels this far outside the iris radius (in radii) count as eye white, not iris.
    irisClear: 1.2,
    // Only the brightest share of the eye opening is treated as sclera.
    brightestKeepFrac: 0.4,
    minPixels: 12,
    // What neutral eye white is expected to look like (a*, b*): slightly warm.
    expectedAB: [2, 9] as const,
    // Chroma beyond expected that starts / fully counts as a colour cast.
    castStart: 6,
    castFull: 20,
  },

  // Mild white-balance correction from the sclera. OFF (0) until it is validated on real photos:
  // the eye white sits in the lid's shadow and has its own tint, so it can easily do harm.
  correction: { strength: 0, maxShift: 4 },

  contrast: {
    // Share of the hair difference vs the eye difference (when hair is usable).
    hairWeight: 0.7,
    // Delta L* thresholds.
    lowMax: 20,
    highMin: 35,
  },

  confidence: {
    // Cheek L* where lighting is fully trusted, and where it bottoms out.
    lightOk: [40, 75] as const,
    lightBad: [22, 92] as const,
    lightFloor: 0.3,
    // Left/right cheek L* difference: fine up to okDelta, worst at badDelta.
    deltaLOk: 6,
    deltaLBad: 20,
    deltaFloor: 0.4,
    // Unknown cast (eye white not found) counts as this.
    castUnknown: 0.85,
    castFloor: 0.5,
    glassesFactor: 0.85,
    // Clipped / crushed share of cheek pixels: each percent point costs this much, up to the cap.
    clipPenaltyPerFrac: 4,
    clipPenaltyCap: 0.5,
    // Usable skin pixels: full trust from fullPixels, half trust at minPixels.
    fullPixels: 600,
    // Level cut-offs on the 0..1 score.
    high: 0.7,
    medium: 0.45,
    // Below this, offer the "confirm your undertone" questions.
    offerQuestions: 0.6,
  },

  // How much the user's answers count against the measurement: 1 - confidence, kept within these.
  confirm: { minWeight: 0.25, maxWeight: 0.8 },
}

export type DepthId = (typeof COLOR.itaBands)[number]['id']

