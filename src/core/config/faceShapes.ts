// [tune] Face-shape classifier: prototypes, spreads, weights (brief section 5.4).
// Every number here is a STARTING VALUE from the brief or a guess. None is validated against
// labeled photos yet (that is M8). Do not treat the output as accuracy.

export const FACE_SHAPES = ['oval', 'round', 'square', 'oblong', 'heart', 'diamond'] as const
export type FaceShape = (typeof FACE_SHAPES)[number]

export const CHIN_CATEGORIES = ['soft', 'angular', 'pointed', 'mixed'] as const
export type ChinCategory = (typeof CHIN_CATEGORIES)[number]

export interface Prototype {
  lengthToWidth: number
  foreheadToCheek: number
  jawToCheek: number
  chin: ChinCategory
}

export const PROTOTYPES: Record<FaceShape, Prototype> = {
  oval: { lengthToWidth: 1.45, foreheadToCheek: 0.85, jawToCheek: 0.75, chin: 'soft' },
  round: { lengthToWidth: 1.15, foreheadToCheek: 0.88, jawToCheek: 0.82, chin: 'soft' },
  square: { lengthToWidth: 1.15, foreheadToCheek: 0.9, jawToCheek: 0.9, chin: 'angular' },
  oblong: { lengthToWidth: 1.6, foreheadToCheek: 0.9, jawToCheek: 0.85, chin: 'mixed' },
  heart: { lengthToWidth: 1.4, foreheadToCheek: 0.95, jawToCheek: 0.65, chin: 'pointed' },
  diamond: { lengthToWidth: 1.45, foreheadToCheek: 0.7, jawToCheek: 0.7, chin: 'pointed' },
}

export type NumericFeature = 'lengthToWidth' | 'foreheadToCheek' | 'jawToCheek'

export const FACE_SHAPE_MODEL = {
  // sigma: how far a feature can be from a prototype before it counts as one "unit" off.
  sigma: { lengthToWidth: 0.12, foreheadToCheek: 0.06, jawToCheek: 0.07 } satisfies Record<NumericFeature, number>,
  // Per-feature weight in the score. `chin` weights the chin-category term.
  weight: { lengthToWidth: 1, foreheadToCheek: 1, jawToCheek: 1, chin: 0.6 },
  // How strongly a poorly matching chin category is penalized (membership 0..1 -> units off).
  chinSigma: 0.5,
  // Softmax temperature. Higher = flatter probabilities.
  temperature: 1.5,
  // Below this top probability the result is shown as "between X and Y".
  betweenThreshold: 0.45,
}

// Axis range of each bar on the "Why this?" screen (display only; does not affect the result).
export const WHY_SCALES: Record<NumericFeature | 'chinAngle', { min: number; max: number }> = {
  lengthToWidth: { min: 1.0, max: 1.8 },
  foreheadToCheek: { min: 0.6, max: 1.05 },
  jawToCheek: { min: 0.55, max: 1.0 },
  chinAngle: { min: 80, max: 150 },
}

// Chin categories from numbers (degrees). Memberships are soft ramps between `zero` and `full`.
export const CHIN_MODEL = {
  // Pointed: a small angle at the chin (V-shaped lower jaw).
  pointed: { chinAngle: { full: 95, zero: 110 } },
  // Angular: a sharp corner along the jaw outline.
  angular: { jawAngularity: { zero: 25, full: 45 } },
  // Soft = neither pointed nor angular.
  // Mixed = no category is clearly the winner: (1 - strongest membership) * mixedBoost, capped at 1.
  // The boost makes "mixed" win a genuine tie instead of losing it by construction.
  mixedBoost: 1.5,
}
