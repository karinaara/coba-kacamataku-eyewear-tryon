// [tune] How much data each evaluation needs before its numbers are worth showing (brief section 9).
// Below these counts a section says "not enough data" instead of printing a figure that looks like a result.

export const EVAL = {
  // 1. Face shape against labelers: "30-50 consenting people", 3 labelers.
  minShapeItems: 30,
  labelers: 3,
  // 2. Measurement stability: "same person, 10 captures".
  minCaptures: 10,
  // 3. Color stability: daylight, indoor warm, indoor cool.
  minConditions: 3,
  referenceCondition: 'daylight',
  // 4. User check: "5-10 people", top 3 vs 3 random frames each.
  minParticipants: 5,
  minTrialsPerArm: 3,
  // Held-out gain (percentage points of top-1 accuracy) a tuned setting must show before it is suggested.
  minTuningGain: 0.05,
  // Smallest labeled set the tuner will run on at all.
  minTuneItems: 20,
  folds: 5,
  // Seed for every bootstrap and fold split, so reports are reproducible.
  seed: 20260101,
}
