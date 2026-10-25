// [tune] Auto-capture and multi-frame median (brief sections 5.2 and 12/M2).

export const CAPTURE = {
  // The gate must stay green this long before the countdown starts.
  holdMs: 500,
  countdownMs: 3000,
  // Valid frames to collect, spaced sampleIntervalMs apart (about 1 s total).
  frames: 20,
  minFrames: 10,
  sampleIntervalMs: 50,
  // Give up if enough valid frames are not collected within this time.
  timeoutMs: 4000,
  // Outlier rejection before the median: threshold = median + madK * MAD of per-frame deviation,
  // never below minThreshold (fraction of face height).
  outlier: { madK: 3, minThreshold: 0.004 },
  maxSnapshotWidth: 1280,
}
