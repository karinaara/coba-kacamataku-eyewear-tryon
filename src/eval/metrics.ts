// Statistics for the M8 evaluation (brief section 9). Pure and dependency free.
// Nothing here knows about faces: it turns lists of numbers and labels into the figures the report shows.

export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

/** Sample standard deviation (n - 1). NaN for fewer than two values. */
export function std(xs: readonly number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

export const median = (xs: readonly number[]) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2
}

/** Small seeded PRNG so every report is reproducible (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- classification ----

export interface Confusion {
  labels: string[]
  /** counts[truth][predicted] */
  counts: number[][]
  total: number
}

export function confusionMatrix(labels: readonly string[], truth: readonly string[], predicted: readonly string[]): Confusion {
  if (truth.length !== predicted.length) throw new Error('truth and predicted must be the same length')
  const idx = new Map(labels.map((l, i) => [l, i]))
  const counts = labels.map(() => labels.map(() => 0))
  for (let i = 0; i < truth.length; i++) {
    const t = idx.get(truth[i] as string)
    const p = idx.get(predicted[i] as string)
    if (t === undefined || p === undefined) throw new Error(`Unknown label in pair ${truth[i]} / ${predicted[i]}`)
    ;(counts[t] as number[])[p] = ((counts[t] as number[])[p] as number) + 1
  }
  return { labels: [...labels], counts, total: truth.length }
}

export interface ClassScores {
  precision: number
  recall: number
  support: number
}

/** Per-class precision, recall and support from a confusion matrix. NaN where undefined (no predictions / no examples). */
export function perClass(c: Confusion): Record<string, ClassScores> {
  return Object.fromEntries(
    c.labels.map((l, i) => {
      const row = c.counts[i] as number[]
      const support = row.reduce((a, b) => a + b, 0)
      const predicted = c.counts.reduce((a, r) => a + (r[i] as number), 0)
      const tp = row[i] as number
      return [l, { precision: predicted ? tp / predicted : NaN, recall: support ? tp / support : NaN, support }]
    }),
  )
}

/** Share of samples whose true label is among the `k` most probable. */
export function topKAccuracy(truth: readonly string[], probabilities: readonly Record<string, number>[], k: number): number {
  if (truth.length === 0) return NaN
  let hit = 0
  truth.forEach((t, i) => {
    const probs = probabilities[i] as Record<string, number>
    const ranked = Object.keys(probs).sort((a, b) => (probs[b] as number) - (probs[a] as number))
    if (ranked.slice(0, k).includes(t)) hit++
  })
  return hit / truth.length
}

/** Mean negative log probability of the true label (lower is better). Probabilities are floored to avoid -log(0). */
export function logLoss(truth: readonly string[], probabilities: readonly Record<string, number>[]): number {
  if (truth.length === 0) return NaN
  return mean(truth.map((t, i) => -Math.log(Math.max(1e-9, (probabilities[i] as Record<string, number>)[t] ?? 0))))
}

// ---- labeler agreement ----

export interface Vote {
  /** The strict majority label, or null if no label has more than half the votes. */
  label: string | null
  votes: number
  of: number
}

export function majorityVote(votes: readonly string[]): Vote {
  const counts = new Map<string, number>()
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: string | null = null
  let bestN = 0
  for (const [l, n] of counts) {
    if (n > bestN) {
      best = l
      bestN = n
    }
  }
  return { label: bestN * 2 > votes.length ? best : null, votes: bestN, of: votes.length }
}

/** Mean share of labeler pairs that agree, over items. */
export function pairwiseAgreement(items: readonly (readonly string[])[]): number {
  const per = items
    .filter((v) => v.length >= 2)
    .map((v) => {
      let agree = 0
      let pairs = 0
      for (let i = 0; i < v.length; i++) {
        for (let j = i + 1; j < v.length; j++) {
          pairs++
          if (v[i] === v[j]) agree++
        }
      }
      return agree / pairs
    })
  return mean(per)
}

/**
 * Fleiss' kappa for items each rated by the same number of raters. 1 = perfect, 0 = chance level.
 * NaN if there are no items or fewer than two raters.
 */
export function fleissKappa(items: readonly (readonly string[])[], categories: readonly string[]): number {
  const N = items.length
  const n = items[0]?.length ?? 0
  if (N === 0 || n < 2) return NaN
  if (items.some((v) => v.length !== n)) throw new Error('Fleiss kappa needs the same number of raters on every item')
  const tallies = items.map((v) => categories.map((c) => v.filter((x) => x === c).length))
  const pI = tallies.map((row) => (row.reduce((a, c) => a + c * c, 0) - n) / (n * (n - 1)))
  const pBar = mean(pI)
  const pe = categories.reduce((a, _c, j) => a + (tallies.reduce((s, row) => s + (row[j] as number), 0) / (N * n)) ** 2, 0)
  return pe === 1 ? 1 : (pBar - pe) / (1 - pe)
}

// ---- stability ----

export interface Spread {
  n: number
  mean: number
  std: number
  /** Coefficient of variation (std / |mean|). */
  cv: number
  min: number
  max: number
}

export function spread(xs: readonly number[]): Spread {
  const m = mean(xs)
  const s = std(xs)
  return { n: xs.length, mean: m, std: s, cv: s / Math.abs(m), min: Math.min(...xs), max: Math.max(...xs) }
}

/** Share of items that differ from the most common value. 0 = perfectly consistent. */
export function flipRate(values: readonly string[]): number {
  if (values.length === 0) return NaN
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return 1 - Math.max(...counts.values()) / values.length
}

/** Euclidean distance in CIELAB (CIE76). */
export const deltaE76 = (a: readonly number[], b: readonly number[]) =>
  Math.hypot((a[0] as number) - (b[0] as number), (a[1] as number) - (b[1] as number), (a[2] as number) - (b[2] as number))

/** Signed shortest difference between two angles in degrees, in (-180, 180]. */
export function angleDiffDeg(a: number, b: number): number {
  const d = (((a - b) % 360) + 540) % 360 - 180
  return d === -180 ? 180 : d
}

// ---- paired comparison (rating study) ----

export interface PairedResult {
  /** Participants with at least one rating in each arm. */
  n: number
  meanA: number
  meanB: number
  meanDiff: number
  /** Bootstrap interval over participants. */
  ci95: [number, number]
  /** Participants who rated arm A higher / lower / equal. */
  favorA: number
  favorB: number
  ties: number
  /** Mean difference divided by the standard deviation of differences (paired effect size). */
  dz: number
}

/**
 * Compares two arms within each participant (their mean rating in A minus in B), then summarizes over
 * participants. The interval resamples participants, not ratings, because ratings from one person are not independent.
 */
export function pairedComparison(perParticipant: readonly { a: number; b: number }[], iterations = 5000, seed = 1): PairedResult {
  const diffs = perParticipant.map((p) => p.a - p.b)
  const n = diffs.length
  const rand = seeded(seed)
  const boots: number[] = []
  for (let i = 0; i < iterations && n > 0; i++) {
    let s = 0
    for (let j = 0; j < n; j++) s += diffs[Math.floor(rand() * n)] as number
    boots.push(s / n)
  }
  boots.sort((a, b) => a - b)
  const q = (p: number) => (boots.length ? (boots[Math.min(boots.length - 1, Math.floor(p * boots.length))] as number) : NaN)
  const sd = std(diffs)
  return {
    n,
    meanA: mean(perParticipant.map((p) => p.a)),
    meanB: mean(perParticipant.map((p) => p.b)),
    meanDiff: mean(diffs),
    ci95: [q(0.025), q(0.975)],
    favorA: diffs.filter((d) => d > 0).length,
    favorB: diffs.filter((d) => d < 0).length,
    ties: diffs.filter((d) => d === 0).length,
    dz: sd > 0 ? mean(diffs) / sd : NaN,
  }
}
