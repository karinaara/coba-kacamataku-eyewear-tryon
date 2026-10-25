// [tune] Measurement settings (brief section 5.3).

export const MEASURE = {
  // Landmark 10 (mesh top) sits BELOW the true hairline, so the mesh face length is too short.
  // Face length = (10 -> 152 distance) * this factor. A single global guess: the real value varies
  // per person, and with a hijab or fringe the hairline is not visible at all. Calibrate on
  // labeled photos in M8.
  hairlineExtension: 1.15,
}
