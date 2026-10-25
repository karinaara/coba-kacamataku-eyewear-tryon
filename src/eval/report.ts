// Turns an EvalReport into Markdown. Pure. Every section leads with its data status, so a section built on
// too little data cannot be mistaken for a result.

import { EVAL } from '../core/config/eval'
import type { ColorEval, EvalReport, FaceShapeEval, PerfEval, RatingEval, Section, StabilityEval } from './evaluate'
import { STABILITY_FEATURES } from './evaluate'
import type { TuneResult } from './tune'

const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a')
const pct = (v: number, d = 0) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : 'n/a')

const BANNER: Record<Section['status'], string> = {
  'no-data': '> **No data yet.**',
  insufficient: '> **Not enough data to draw conclusions.**',
  ok: '> Data meets the minimum for this section.',
}
const banner = (s: Section) => `${BANNER[s.status]}${s.message ? ' ' + s.message : ''}\n`

const table = (head: string[], rows: string[][]) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')

function shape(s: FaceShapeEval): string {
  const out = ['## 1. Face shape against human labelers', '', banner(s)]
  if (s.items === 0) return out.join('\n')
  out.push(
    `Labeled faces: **${s.items}**. With a labeler majority: **${s.withConsensus}**${s.noConsensusIds.length ? ` (no majority: ${s.noConsensusIds.join(', ')})` : ''}.`,
    '',
    '**How much the labelers agree** (face shape is a fuzzy call, so this caps what any model can score):',
    '',
    table(
      ['Measure', 'Value'],
      [
        ['Labelers per face', String(s.agreement.labelers)],
        ['Unanimous', `${s.agreement.unanimous} of ${s.items}`],
        ['Pairwise agreement', pct(s.agreement.pairwise)],
        ["Fleiss' kappa (0 = chance, 1 = perfect)", f(s.agreement.fleissKappa)],
        ['A single labeler matches the majority', pct(s.agreement.labelerVsMajority)],
      ],
    ),
    '',
    '**The model against the majority label:**',
    '',
    table(
      ['Measure', 'Value'],
      [
        ['Top-1 accuracy', pct(s.top1, 1)],
        ['Top-2 accuracy', pct(s.top2, 1)],
        ['Matches at least one labeler', pct(s.matchesAnyLabeler, 1)],
        ['Log loss (lower is better)', f(s.logLoss, 3)],
      ],
    ),
    '',
  )
  if (s.confusion) {
    const labels = s.confusion.labels
    out.push('**Confusion matrix** (rows = what the labelers said, columns = what the app said):', '', table(['', ...labels, 'Total'], labels.map((l, i) => [`**${l}**`, ...(s.confusion!.counts[i] as number[]).map(String), String((s.confusion!.counts[i] as number[]).reduce((a, b) => a + b, 0))])), '')
  }
  if (s.perClass) {
    out.push('**Per shape:**', '', table(['Shape', 'Faces', 'Precision', 'Recall'], Object.entries(s.perClass).map(([k, v]) => [k, String(v.support), pct(v.precision), pct(v.recall)])), '')
  }
  if (s.labelsWithoutFixture.length) out.push(`Labels with no matching fixture (check the ids): ${s.labelsWithoutFixture.join(', ')}`, '')
  if (s.fixturesWithoutLabel.length) out.push(`Fixtures with no label: ${s.fixturesWithoutLabel.join(', ')}`, '')
  return out.join('\n')
}

function stability(s: StabilityEval): string {
  const out = ['## 2. Measurement stability (same person, repeated captures)', '', banner(s)]
  if (s.people.length === 0) return out.join('\n')
  out.push(
    table(
      ['Person', 'Captures', ...STABILITY_FEATURES.map((k) => `${k} (mean, std)`), 'Shape flips'],
      s.people.map((p) => [p.person, String(p.captures), ...STABILITY_FEATURES.map((k) => `${f(p.features[k].mean)}, ${f(p.features[k].std, 3)}`), `${pct(p.shapeFlipRate)} (${Object.entries(p.primaryShapes).map(([a, n]) => `${a} ${n}`).join(', ')})`]),
    ),
    '',
    `Mean coefficient of variation: ${STABILITY_FEATURES.map((k) => `${k} ${pct(s.meanCv[k], 1)}`).join(', ')}.`,
    '',
    `Mean share of captures whose primary shape differs from that person's usual one: **${pct(s.meanShapeFlipRate, 1)}**. The aim is that the primary shape rarely flips.`,
    '',
  )
  return out.join('\n')
}

function color(s: ColorEval): string {
  const out = ['## 3. Color stability across lighting', '', banner(s)]
  if (s.rows.length === 0) return out.join('\n')
  out.push(
    table(['Person', 'Condition', 'vs', 'Skin color shift (delta E)', 'Hue shift', 'Undertone flipped', 'Depth changed', 'Confidence (ref)'], s.rows.map((r) => [r.person, r.condition, r.reference, f(r.deltaE, 1), `${r.hueShiftDeg >= 0 ? '+' : ''}${f(r.hueShiftDeg, 1)} deg`, r.undertoneFlip ? 'yes' : 'no', r.depthChanged ? 'yes' : 'no', `${pct(r.confidence)} (${pct(r.referenceConfidence)})`])),
    '',
    `Undertone flipped in **${s.flips} of ${s.comparisons}** comparisons. Confidence was lower than the reference in ${s.confidenceLower} of ${s.comparisons}.`,
    '',
    s.confidenceNoticedBigDrift.of
      ? `Of the ${s.confidenceNoticedBigDrift.of} comparisons where the skin color moved by more than 5 delta E, confidence dropped in **${s.confidenceNoticedBigDrift.noticed}**. That is how well the confidence notices trouble.`
      : 'No comparison moved the skin color by more than 5 delta E.',
    '',
  )
  return out.join('\n')
}

function ratings(s: RatingEval): string {
  const out = ['## 4. "Does this frame suit me?" (top 3 vs 3 random)', '', banner(s)]
  if (!s.result) return out.join('\n')
  const r = s.result
  out.push(
    table(['Measure', 'Value'], [
      ['Participants (both arms rated)', String(r.n)],
      ['Mean rating, top 3 picks', f(r.meanA)],
      ['Mean rating, 3 random frames', f(r.meanB)],
      ['Mean difference (top minus random)', `${r.meanDiff >= 0 ? '+' : ''}${f(r.meanDiff)}`],
      ['95% interval (resampling participants)', `${f(r.ci95[0])} to ${f(r.ci95[1])}`],
      ['Participants who rated top higher / random higher / equal', `${r.favorA} / ${r.favorB} / ${r.ties}`],
      ['Paired effect size (dz)', f(r.dz)],
    ]),
    '',
    r.ci95[0] > 0 ? 'The interval is above zero: on this sample the suggestions were rated higher than random frames.' : 'The interval includes zero: this sample does not show the suggestions beating random frames.',
    '',
  )
  if (s.excluded.length) out.push(`Left out for having fewer than ${EVAL.minTrialsPerArm} ratings in an arm: ${s.excluded.join(', ')}`, '')
  return out.join('\n')
}

function perf(s: PerfEval): string {
  const out = ['## 5. Performance', '', banner(s)]
  if (s.entries.length === 0) return out.join('\n')
  out.push(
    table(['Device', 'Kind', 'Load to landing', 'Model load (cold / warm)', 'First detection', 'Detection ms (median / p95)', 'Detections per second (headroom)', 'Delegate'], s.entries.map((e) => [e.device, e.kind, e.loadToLandingMs ? `${f(e.loadToLandingMs, 0)} ms` : 'n/a', `${f(e.modelLoadMs, 0)} ms${e.modelLoadWarmMs ? ` / ${f(e.modelLoadWarmMs, 0)} ms` : ''}`, `${f(e.firstDetectionMs, 0)} ms`, `${f(e.detectMsMedian, 1)} / ${f(e.detectMsP95, 1)}`, `${f(e.detectFps, 1)}${e.headroomFps ? ` (${f(e.headroomFps, 0)})` : ''}`, e.delegate ?? 'n/a'])),
    '',
    ...s.entries.filter((e) => e.note).map((e) => `- ${e.device}: ${e.note}`),
    '',
  )
  return out.join('\n')
}

export function tuneSection(t: TuneResult | null): string {
  const out = ['## Tuning', '']
  if (!t) return [...out, '> **No labeled faces, so nothing was tuned.** The config values are the brief\'s starting values.', ''].join('\n')
  out.push(
    `> ${t.reason}`,
    '',
    table(['', 'Top-1', 'Top-2', 'Log loss'], [
      ['Current config, held-out folds', pct(t.heldOutCurrent.top1, 1), pct(t.heldOutCurrent.top2, 1), f(t.heldOutCurrent.logLoss, 3)],
      ['Tuned on the other folds, held-out', pct(t.heldOutTuned.top1, 1), pct(t.heldOutTuned.top2, 1), f(t.heldOutTuned.logLoss, 3)],
      ['Best on ALL faces (optimistic: picked on the same data)', pct(t.bestTrainScore.top1, 1), pct(t.bestTrainScore.top2, 1), f(t.bestTrainScore.logLoss, 3)],
    ]),
    '',
    `Best setting on all ${t.n} faces: hairline extension ${t.best.hairlineExtension}, softmax temperature ${t.best.softmaxTemperature}, sigma scale ${t.best.sigmaScale}, chin weight ${t.best.chinWeight}. ${t.recommend ? '' : 'It is listed for information only and is not advised.'}`,
    '',
  )
  return out.join('\n')
}

export function renderReport(r: EvalReport, tune: TuneResult | null, generated: string): string {
  return [
    '# Evaluation report',
    '',
    `Generated ${generated} by \`npm run eval\`. Fixtures hold landmarks only, never photos.`,
    '',
    'Each section opens with a data status. **A section marked "No data yet" or "Not enough data" is not a result**, and its numbers (if any) should not be quoted.',
    '',
    shape(r.shape),
    stability(r.stability),
    color(r.color),
    ratings(r.ratings),
    perf(r.perf),
    tuneSection(tune),
  ].join('\n')
}
