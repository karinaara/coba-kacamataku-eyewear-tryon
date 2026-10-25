import { useEffect, useMemo, useState } from 'react'
import type { CaptureResult } from '../camera/captureResult'
import { download } from '../camera/evalTools'
import { SIZES } from '../core/config/frames'
import type { Recommendations } from '../core/recommend'
import { buildTrials, ratingRows, ratingsCsv, TRIALS_PER_ARM } from '../eval/study'
import { getFrame, type FrameBitmap } from '../frames/raster'
import { PhotoPreview } from './TryOnPreview'

const LABELS: Record<number, string> = { 1: 'Not at all', 2: 'Not really', 3: 'Maybe', 4: 'Quite well', 5: 'Love it' }

/**
 * The rating study (open the app with ?study). A participant rates six frames on their own photo:
 * the app's top three and three random ones, shuffled. The screen never says which is which.
 */
export function StudyScreen({ result, recs, onBack }: { result: CaptureResult; recs: Recommendations; onBack: () => void }) {
  const [participant, setParticipant] = useState('')
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [ratings, setRatings] = useState<number[]>([])
  const [current, setCurrent] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; entry: FrameBitmap } | null>(null)
  const [copied, setCopied] = useState(false)

  const trials = useMemo(() => (started ? buildTrials(recs, participant.trim()) : []), [started, recs, participant])
  const trial = trials[index]
  const done = started && index >= trials.length
  const key = trial ? `${index}|${trial.styleId}|${trial.colorId}` : ''

  useEffect(() => {
    if (!trial) return
    let cancelled = false
    getFrame({ styleId: trial.styleId, colorId: trial.colorId, tint: 'clear', size: trial.size })
      .then((entry) => !cancelled && setLoaded({ key, entry }))
      .catch((e: unknown) => console.error(e))
    return () => {
      cancelled = true
    }
  }, [trial, key])

  const ready = loaded?.key === key
  const rows = done ? ratingRows(participant.trim(), trials, ratings) : []
  const csv = ratingsCsv(rows)

  const next = () => {
    if (current === null) return
    setRatings((r) => [...r, current])
    setCurrent(null)
    setIndex((i) => i + 1)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-10 pt-4">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">Back</button>
        <h1 className="font-display text-base font-bold">Rate these frames</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      {!started && (
        <section className="flex flex-col gap-3 rounded-3xl bg-white p-5">
          <p className="text-sm">You will see {2 * TRIALS_PER_ARM} frames on your photo, one at a time. For each, say how well it suits you. There are no right answers, and we are testing the app, not you.</p>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Your code (given to you, not your name)
            <input className="min-h-11 rounded-xl border border-ink/20 px-3 font-normal" value={participant} onChange={(e) => setParticipant(e.target.value)} placeholder="p01" />
          </label>
          <button type="button" disabled={participant.trim() === ''} onClick={() => setStarted(true)} className="min-h-12 rounded-2xl bg-accent px-6 text-base font-semibold text-white disabled:opacity-50">
            Start
          </button>
        </section>
      )}

      {started && trial && (
        <>
          <p className="text-sm text-muted" role="status">Frame {index + 1} of {trials.length}</p>
          <PhotoPreview result={result} entry={ready ? loaded.entry : null} sizeFactor={(SIZES.find((s) => s.id === trial.size) as (typeof SIZES)[number]).fitFactor} />
          <fieldset className="rounded-3xl bg-white p-5">
            <legend className="px-1 text-sm font-semibold">Does this frame suit you?</legend>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Rating from 1 (not at all) to 5 (love it)">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={current === n}
                  aria-label={`${n}, ${LABELS[n]}`}
                  disabled={!ready}
                  onClick={() => setCurrent(n)}
                  className={`grid min-h-14 flex-1 place-items-center rounded-2xl text-lg font-bold disabled:opacity-40 ${current === n ? 'bg-accent text-white' : 'bg-chip text-chip-ink'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted" aria-hidden="true">
              <span>Not at all</span>
              <span>Love it</span>
            </div>
          </fieldset>
          <button type="button" onClick={next} disabled={current === null || !ready} className="min-h-12 rounded-2xl bg-accent px-6 text-base font-semibold text-white disabled:opacity-50">
            {index + 1 === trials.length ? 'Finish' : 'Next frame'}
          </button>
        </>
      )}

      {done && (
        <section className="flex flex-col gap-3 rounded-3xl bg-white p-5" aria-live="polite">
          <h2 className="font-display text-lg font-bold">Thank you</h2>
          <p className="text-sm">That is all. For the person running the study: save the answers below into <code>fixtures/ratings/</code>.</p>
          <button type="button" onClick={() => download(`ratings-${participant.trim()}.csv`, csv, 'text/csv')} className="min-h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-white">
            Save ratings CSV
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(csv).then(() => setCopied(true))
            }}
            className="min-h-11 rounded-2xl bg-chip px-5 text-sm font-semibold text-chip-ink"
          >
            {copied ? 'Copied' : 'Copy as text'}
          </button>
          <pre id="study-csv" className="overflow-x-auto rounded-xl bg-ground p-3 text-xs">{csv}</pre>
        </section>
      )}
    </main>
  )
}
