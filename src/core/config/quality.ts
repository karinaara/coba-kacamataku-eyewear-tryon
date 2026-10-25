// [tune] Quality gate thresholds (brief section 5.1). Starting values, not ground truth.

export const QUALITY = {
  // Frame is downscaled to this width before pixel analysis.
  analysisWidth: 480,
  // How often the (pixel-based) gate re-evaluates while the camera runs.
  intervalMs: 200,
  // A gate result older than this no longer counts as "ready".
  maxReportAgeMs: 600,

  // Face bbox height (landmark 10..152 extent) as a fraction of frame height.
  faceHeightFrac: { min: 0.35, max: 0.85 },
  // Max offset of the face-box center from the frame center, as a fraction of frame size.
  centerTolerance: { x: 0.15, y: 0.15 },
  // All landmarks must stay at least this far inside the frame edge.
  edgeMargin: 0.005,

  pose: { maxYawDeg: 8, maxPitchDeg: 10, maxRollDeg: 10 },

  lighting: {
    meanLMin: 35,
    meanLMax: 80,
    maxClippedFrac: 0.05,
    maxCrushedFrac: 0.05,
    clippedAbove: 250, // luma 0..255
    crushedBelow: 10,
  },
  evenLighting: { maxDeltaL: 12 },

  forehead: {
    minSkinRatio: 0.7,
    // A forehead pixel counts as skin if its Lab distance to the cheek median is small.
    // L* differences are down-weighted because the forehead is naturally a bit lighter/darker.
    lWeight: 0.5,
    maxDistance: 20,
  },

  eyes: { minEar: 0.2 },
  // Inner-lip gap (13..14) divided by face height (10..152).
  mouth: { maxOpenRatio: 0.08 },

  // Warn-only checks. Both are UNCALIBRATED: no glasses/cast samples have been tested yet.
  glasses: { maxEdgeEnergy: 0.08 },
  colorCast: { maxChroma: 15 },

  // Sampling regions are shrunk toward their center by this factor, so they stay off the face
  // edge where hair, hijab or shadow can leak in. 1 = the full landmark hull.
  roiScale: { cheek: 0.8, forehead: 0.8 },

  // Fewer sampled pixels than this in a region means the region is not usable.
  minRoiPixels: 40,
}

export type QualityMode = 'camera' | 'upload'
