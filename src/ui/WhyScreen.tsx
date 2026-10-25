import type { FaceAnalysis } from '../core/analyze'
import { FACE_SHAPES } from '../core/config/faceShapes'
import { SHAPE_LABEL, type Closeness, type WhyRow } from '../core/explain'
import type { Recommendations } from '../core/recommend'
import { FrameReasons } from './FrameReasons'

const pct = (v: number) => `${Math.round(v * 100)}%`

const CLOSE_TEXT: Record<Closeness, string> = { close: 'Close match', near: 'Fairly close', far: 'Weak match' }
const CLOSE_STYLE: Record<Closeness, string> = {
  close: 'bg-chip text-chip-ink',
  near: 'bg-amber-100 text-amber-900',
  far: 'bg-red-100 text-red-900',
}

const at = (v: number, min: number, max: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`

/** One real measurement on an axis, with where the top two shapes sit. Text carries the meaning, not color. */
function Bar({ row, primary, secondary }: { row: WhyRow; primary: string; secondary: string }) {
  const { min, max } = row.scale
  const [m1, m2] = row.markers
  return (
    <li className="rounded-2xl bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{row.label}</p>
          <p className="text-sm text-muted">{row.reading}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${CLOSE_STYLE[row.closeness]}`}>{CLOSE_TEXT[row.closeness]}</span>
      </div>
      <div className="relative mt-5 h-2 rounded-full bg-chip" aria-hidden="true">
        {[m1, m2].map((m, i) =>
          m ? (
            <span key={m.shape} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: at(m.value, min, max) }}>
              <span className={`block h-4 w-0.5 ${i === 0 ? 'bg-ink' : 'bg-muted/60'}`} />
            </span>
          ) : null,
        )}
        <span className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow" style={{ left: at(row.value, min, max) }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Teal dot: you. Dark tick: {primary}. Light tick: {secondary}.
      </p>
    </li>
  )
}

export function WhyScreen({ analysis, recs, onBack }: { analysis: FaceAnalysis; recs: Recommendations; onBack: () => void }) {
  const { shape, why, measurements: m } = analysis
  const P = SHAPE_LABEL[shape.primary]
  const S = SHAPE_LABEL[shape.secondary]
  const ranked = [...FACE_SHAPES].sort((a, b) => shape.probabilities[b] - shape.probabilities[a])
  const chin = why.chin
  const chinPos = at(chin.angle, chin.scale.min, chin.scale.max)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-8 pt-4">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">
          Back
        </button>
        <h1 className="font-display text-base font-bold">Why this?</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <p className="text-sm text-muted">
        We measured these proportions on your face and compared them with a typical face of each shape. The closer the match, the bigger that shape's share.
      </p>

      <ul className="flex flex-col gap-3" aria-label="Your measurements">
        {why.rows.map((row) => (
          <Bar key={row.id} row={row} primary={P} secondary={S} />
        ))}
        <li className="rounded-2xl bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Chin and jaw</p>
              <p className="text-sm text-muted">Chin angle {Math.round(chin.angle)} degrees, reads as {chin.category}</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${chin.matches ? CLOSE_STYLE.close : CLOSE_STYLE.near}`}>
              {chin.matches ? 'Fits' : 'Differs'}
            </span>
          </div>
          <div className="relative mt-5 h-2 rounded-full bg-chip" aria-hidden="true">
            <span className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow" style={{ left: chinPos }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted" aria-hidden="true">
            <span>{chin.scale.min} pointed</span>
            <span>{chin.scale.max} wide</span>
          </div>
        </li>
      </ul>

      <section className="rounded-3xl bg-white p-5" aria-labelledby="rule-heading">
        <h2 id="rule-heading" className="font-display text-lg font-bold">
          The rule that picked {P}
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm">
          {why.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Final shares: {ranked.map((s) => `${SHAPE_LABEL[s]} ${pct(shape.probabilities[s])}`).join(', ')}.
        </p>
      </section>

      {why.notes.map((n) => (
        <p key={n} className="text-xs text-muted">
          {n}
        </p>
      ))}

      <FrameReasons recs={recs} />

      <details className="rounded-3xl bg-white p-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Details for tuning</summary>
        <table className="mt-3 w-full text-left text-xs">
          <tbody>
            {(
              [
                ['Cheekbone width', m.cheekWidth, 0],
                ['Forehead width', m.foreheadWidth, 0],
                ['Jaw width (172/397)', m.jawWidth, 0],
                ['Jaw width, higher pair (58/288)', m.jawWidthHigh, 0],
                ['Face length, mesh only', m.faceLengthMesh, 0],
                ['Face length, with hairline estimate', m.faceLength, 0],
                ['Length / width', m.lengthToWidth, 3],
                ['Forehead / cheek', m.foreheadToCheek, 3],
                ['Jaw / cheek', m.jawToCheek, 3],
                ['Jaw / forehead', m.jawToForehead, 3],
                ['Chin angle (deg)', m.chinAngle, 1],
                ['Jaw sharpest turn (deg)', m.jawAngularity, 1],
                ['Roll removed (deg)', m.correction.rollDeg, 1],
                ['Yaw corrected (deg)', m.correction.yawDeg, 1],
                ['Pitch corrected (deg)', m.correction.pitchDeg, 1],
              ] as [string, number, number][]
            ).map(([label, v, d]) => (
              <tr key={label} className="border-t border-ground">
                <th scope="row" className="py-1 pr-2 font-normal text-muted">{label}</th>
                <td className="py-1 text-right font-semibold tabular-nums">{v.toFixed(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </main>
  )
}

