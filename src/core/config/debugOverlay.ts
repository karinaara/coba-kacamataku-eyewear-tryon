// [tune] Look and behavior of the landmark index debug overlay.

export const DEBUG_OVERLAY = {
  dotRadius: 1.6,
  keyDotRadius: 4,
  dotColor: 'rgba(15, 118, 110, 0.85)',
  keyDotColor: '#f59e0b',
  labelColor: '#ffffff',
  labelStroke: 'rgba(17, 24, 39, 0.85)',
  labelFontPx: 9,
  keyLabelFontPx: 12,
  // Fraction of FPS samples kept for the rolling average.
  fpsWindowMs: 1000,
  // Only label points inside this many px of the pointer in "near pointer" mode.
  nearPointerPx: 60,
}
