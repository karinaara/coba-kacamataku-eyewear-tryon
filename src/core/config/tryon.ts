// [tune] Try-on fit and smoothing (brief sections 5.2 and 6.4). Starting values, not validated on real faces.

export const FIT = {
  // How frame size is decided:
  //  'iris'  = the frame's real width (mm, from its style) x the size factor, using the iris as a ruler.
  //            Frames differ in width like real ones do, and sizes S/M/L really are smaller/larger.
  //  'cheek' = every frame is as wide as the cheekbones x fitFactor x the size factor.
  // Falls back to 'cheek' when the iris is too small in the picture to measure.
  scaleBasis: 'iris' as 'iris' | 'cheek',
  // Average visible iris diameter in adults. People vary by about +/-8%, which is the error of the ruler.
  irisMm: 11.7,
  minIrisPx: 5,
  // Extra global scale on the iris-based width, for tuning by eye.
  frameScale: 1.0,
  // 'cheek' basis only: frame front width = cheekbone width x this x the size factor.
  fitFactor: 1.0,
  // 0 = center the frame on the midpoint of the irises, 1 = on the nose bridge (landmark 168).
  bridgeWeight: 0.5,
  // Moves the lens center below (+) or above (-) the iris line, as a fraction of the lens height.
  lensCenterOffset: 0,
  yaw: {
    // Frame width is never squashed below this share of its frontal width.
    minCos: 0.5,
    // The temple on the far side fades out between these yaw angles (degrees).
    farTempleFadeStartDeg: 8,
    farTempleHideDeg: 25,
    // The near temple starts fading at the hide angle and is gone this many degrees later.
    nearTempleFadeSpanDeg: 15,
    // The whole frame fades out for extreme turns, where a flat picture no longer looks right.
    frontFadeStartDeg: 40,
    frontHideDeg: 55,
  },
}

/** One Euro filter settings. Positions are in video pixels; angles in degrees. */
export const SMOOTHING = {
  position: { minCutoff: 1.0, beta: 0.025, dCutoff: 1.0 },
  yaw: { minCutoff: 0.8, beta: 0.02, dCutoff: 1.0 },
  // The iris size (the ruler for frame size): smoothed hard, since it should barely change.
  scale: { minCutoff: 0.6, beta: 0.01, dCutoff: 1.0 },
  // If no face is seen for this long (ms), the filters restart instead of gliding in from the old pose.
  resetAfterMs: 300,
}

