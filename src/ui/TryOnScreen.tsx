import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CaptureResult } from '../camera/captureResult'
import type { FaceAnalysis } from '../core/analyze'
import type { ColorProfile } from '../core/colorProfile'
import { FRAME_COLORS, type FrameColor } from '../core/config/colors'
import { FACE_SHAPES } from '../core/config/faceShapes'
import { LENS_TINTS, SIZES, type LensTintId, type SizeId } from '../core/config/frames'
import { STYLE_CHIPS, type StyleChip } from '../core/config/recommend'
import { SHAPE_LABEL } from '../core/explain'
import { hasPrefs, type Preferences } from '../core/preferences'
import { explainPair, type Recommendations } from '../core/recommend'
import type { FrameSpec } from '../frames/catalog'
import { getFrame, type FrameBitmap } from '../frames/raster'
import { ColorSummary } from './ColorSummary'
import { AvoidList } from './FrameReasons'
import { FrameCarousel } from './FrameCarousel'
import { matchLabel, sizeName } from './recText'
import { SwatchRow } from './SwatchRow'
import { LivePreview, PhotoPreview } from './TryOnPreview'

const pct = (v: number) => `${Math.round(v * 100)}%`

type Mode = 'live' | 'photo'

/** What the user has chosen on this screen, kept by the parent so it survives a trip to Why this?. */
export interface TryOnPick {
  styleId: string
  colorId: string
  tint: LensTintId
  sizeChoice: SizeId | null
}

const chip = (on: boolean) =>
  `min-h-11 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? 'bg-accent text-white' : 'bg-chip text-chip-ink'}`

const CHIP_LABEL: Record<StyleChip, string> = { minimal: 'Minimal', classic: 'Classic', bold: 'Bold' }

function Thumb({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-5 ${up ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 11v9H4v-9h3Zm0 0 4-8c1.7 0 2.7 1.2 2.4 2.9L13 9h5.5c1.4 0 2.4 1.3 2 2.7l-1.6 6.5c-.3 1-1.2 1.8-2.3 1.8H7" />
    </svg>
  )
}

/** Screen 4: face shape, then live try-on over frames ranked for this face, with colors, size and taste. */
export function TryOnScreen({
  result,
  analysis,
  profile,
  recs,
  prefs,
  remember,
  initialPick,
  onPick,
  onChip,
  onReact,
  onRemember,
  onClearPrefs,
  onWhy,
  onColors,
  onStudy,
  onShare,
  lite,
  onLite,
  view3d,
  onView3d,
  onRetake,
}: {
  result: CaptureResult
  analysis: FaceAnalysis
  profile: ColorProfile | null
  recs: Recommendations
  prefs: Preferences
  remember: boolean
  initialPick: TryOnPick | null
  onPick: (p: TryOnPick) => void
  onChip: (c: StyleChip | null) => void
  onReact: (styleId: string, colorId: string, vote: 1 | -1) => void
  onRemember: (on: boolean) => void
  onClearPrefs: () => void
  onWhy: () => void
  onColors: () => void
  /** Only given when the app was opened with ?study: shows the "rate these frames" button. */
  onStudy?: () => void
  onShare: () => void
  lite: boolean
  onLite: (on: boolean) => void
  view3d: boolean
  onView3d: (on: boolean) => void
  onRetake: () => void
}) {
  const [mode, setMode] = useState<Mode>(result.source === 'camera' ? 'live' : 'photo')
  const [notice, setNotice] = useState<string | null>(null)
  // Start on the top pick in its best color.
  const [styleId, setStyleId] = useState(() => initialPick?.styleId ?? recs.styles[0]!.styleId)
  const [colorId, setColorId] = useState(() => initialPick?.colorId ?? recs.bestColorFor(recs.styles[0]!.styleId).colorId)
  const [tint, setTint] = useState<LensTintId>(() => initialPick?.tint ?? 'clear')
  // Until the user picks a size, the suggested one for the current style is used.
  const [sizeChoice, setSizeChoice] = useState<SizeId | null>(() => initialPick?.sizeChoice ?? null)
  const [entry, setEntry] = useState<FrameBitmap | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const ids = useMemo(() => recs.styles.map((s) => s.styleId), [recs])
  const index = Math.max(0, ids.indexOf(styleId))
  const styleRec = recs.styleById.get(styleId)!
  const suggested = styleRec.bestSize
  const size = sizeChoice ?? suggested
  const sizeInfo = SIZES.find((s) => s.id === size) as (typeof SIZES)[number]

  const swatches = useMemo(() => {
    const best = new Set(recs.topColors.map((c) => c.colorId))
    const byId = new Map(FRAME_COLORS.map((c) => [c.id, c]))
    const first = recs.topColors.map((c) => byId.get(c.colorId) as FrameColor)
    return { list: [...first, ...FRAME_COLORS.filter((c) => !best.has(c.id))], best }
  }, [recs])

  const pair = explainPair(recs, styleId, colorId)
  const avoided = recs.avoidStyles.some((a) => a.rec.styleId === styleId)
  const badge = index < recs.topStyles.length ? 'Top pick' : avoided ? 'Less suited' : null

  // Load the picture for the current choice, and warm the neighbours so the next tap is instant.
  useEffect(() => {
    let cancelled = false
    const spec: FrameSpec = { styleId, colorId, tint, size }
    getFrame(spec)
      .then((e) => !cancelled && setEntry(e))
      .catch((err: unknown) => console.error('Could not draw frame', err))
    const n = ids.length
    const ci = swatches.list.findIndex((c) => c.id === colorId)
    const around = [
      { ...spec, styleId: ids[(index + 1) % n] as string },
      { ...spec, styleId: ids[(index + n - 1) % n] as string },
      { ...spec, colorId: (swatches.list[(ci + 1) % swatches.list.length] as FrameColor).id },
      { ...spec, colorId: (swatches.list[(ci + swatches.list.length - 1) % swatches.list.length] as FrameColor).id },
    ]
    for (const s of around) void getFrame(s).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [styleId, colorId, tint, size, ids, index, swatches])

  useEffect(() => {
    onPick({ styleId, colorId, tint, sizeChoice })
  }, [styleId, colorId, tint, sizeChoice, onPick])

  const onUnavailable = useCallback((reason: string) => {
    setNotice(reason)
    setMode('photo')
  }, [])

  const spec3d = useMemo<FrameSpec>(() => ({ styleId, colorId, tint, size }), [styleId, colorId, tint, size])
  const on3dFailed = useCallback(
    (reason: string) => {
      setNotice(reason)
      onView3d(false)
    },
    [onView3d],
  )

  const react = (vote: 1 | -1) => {
    onReact(styleId, colorId, vote)
    setFeedback(vote === 1 ? 'Noted. We will lean toward frames like this.' : 'Noted. We will show fewer like this.')
  }

  const { shape } = analysis
  const P = SHAPE_LABEL[shape.primary]
  const S = SHAPE_LABEL[shape.secondary]
  const ranked = [...FACE_SHAPES].sort((a, b) => shape.probabilities[b] - shape.probabilities[a])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-10 pt-4">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onRetake} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">
          Start over
        </button>
        <h1 className="font-display text-base font-bold">Try on</h1>
        <button type="button" onClick={onWhy} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">
          Why this?
        </button>
      </header>

      {mode === 'live' ? (
        <LivePreview entry={entry} sizeFactor={sizeInfo.fitFactor} spec={spec3d} view3d={view3d} on3dFailed={on3dFailed} lite={lite} onLite={onLite} onUnavailable={onUnavailable} />
      ) : (
        <PhotoPreview result={result} entry={entry} sizeFactor={sizeInfo.fitFactor} spec={spec3d} view3d={view3d} on3dFailed={on3dFailed} />
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2" role="radiogroup" aria-label="Preview source">
          <button type="button" role="radio" aria-checked={mode === 'live'} className={chip(mode === 'live')} onClick={() => { setNotice(null); setMode('live') }}>
            Live camera
          </button>
          <button type="button" role="radio" aria-checked={mode === 'photo'} className={chip(mode === 'photo')} onClick={() => setMode('photo')}>
            My photo
          </button>
        </div>
      </div>
      {notice && (
        <p role="status" className="rounded-2xl bg-white p-3 text-sm">
          {notice}
        </p>
      )}

      <section className="flex flex-col gap-1" aria-label="3D view">
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-accent" checked={view3d} onChange={(e) => onView3d(e.target.checked)} />
          3D view (beta)
        </label>
        <p className="text-xs text-muted">
          Frames turn with your head and the far arm hides behind your face. Downloads a bit more the first time and may run slower on older phones. Still being tested, so it may look off at big head turns.
        </p>
      </section>

      <section className="flex items-center justify-between gap-3 rounded-3xl bg-white p-4" aria-label="Your face shape">
        <div>
          <p className="text-xs text-muted">Your face looks</p>
          <p className="font-display text-xl font-bold">
            {shape.between ? `Between ${P} and ${S}` : P}
            {!shape.between && <span className="ml-2 text-base text-accent">{pct(shape.probabilities[shape.primary])}</span>}
          </p>
          <p className="text-xs text-muted">
            {shape.between ? `${P} ${pct(shape.probabilities[shape.primary])}, ${S} ${pct(shape.probabilities[shape.secondary])}` : `Also a bit ${S} (${pct(shape.probabilities[shape.secondary])})`}
          </p>
        </div>
      </section>

      <ColorSummary profile={profile} onDetails={onColors} />

      <section aria-labelledby="taste-heading" className="flex flex-col gap-2">
        <h2 id="taste-heading" className="text-sm font-semibold">Your style</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="taste-heading">
          <button type="button" role="radio" aria-checked={prefs.chip === null} className={chip(prefs.chip === null)} onClick={() => onChip(null)}>
            Any
          </button>
          {STYLE_CHIPS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={prefs.chip === c} className={chip(prefs.chip === c)} onClick={() => onChip(c)}>
              {CHIP_LABEL[c]}
            </button>
          ))}
        </div>
      </section>

      <FrameCarousel ids={ids} index={index} badge={badge} onChange={(i) => setStyleId(ids[i] as string)} />

      <section className="flex flex-col gap-2 rounded-3xl bg-white p-4" aria-labelledby="why-frame-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="why-frame-heading" className="text-sm font-semibold">Why this frame</h2>
          <span className="rounded-full bg-chip px-3 py-1 text-xs font-semibold text-chip-ink">{matchLabel(pair.score)}</span>
        </div>
        {pair.reasons.length > 0 ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {pair.reasons.slice(0, 3).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing stands out for or against this one. It is a matter of taste.</p>
        )}
        {pair.cautions.length > 0 && <p className="text-sm text-warn">Keep in mind: {pair.cautions.slice(0, 2).join(' ')}</p>}
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={() => react(1)} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-chip px-4 text-sm font-semibold text-chip-ink" aria-label="I like this frame">
            <Thumb up /> Like
          </button>
          <button type="button" onClick={() => react(-1)} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-chip px-4 text-sm font-semibold text-chip-ink" aria-label="Not for me">
            <Thumb up={false} /> Not for me
          </button>
        </div>
        {feedback && (
          <p role="status" className="text-xs text-muted">
            {feedback}
          </p>
        )}
      </section>

      <SwatchRow colors={swatches.list} best={swatches.best} value={colorId} onChange={setColorId} />

      <section aria-labelledby="size-heading" className="flex flex-col gap-2">
        <h2 id="size-heading" className="text-sm font-semibold">Size</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="size-heading">
          {SIZES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={size === s.id} className={chip(size === s.id)} onClick={() => setSizeChoice(s.id)}>
              {s.name}
              {s.id === suggested ? ' (suggested)' : ''}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {analysis.scale
            ? `${sizeName(suggested)} fits you best in this style. Sizes are estimated from your iris, so they are good to about 10%.`
            : 'We could not measure your face size, so no size is suggested.'}
        </p>
      </section>

      <section aria-labelledby="lens-heading" className="flex flex-col gap-2">
        <h2 id="lens-heading" className="text-sm font-semibold">Lenses</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="lens-heading">
          {LENS_TINTS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tint === t.id} className={chip(tint === t.id)} onClick={() => setTint(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
      </section>

      <details className="rounded-3xl bg-white p-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Might not suit you</summary>
        <div className="mt-2">
          <AvoidList recs={recs} />
        </div>
      </details>

      <details className="rounded-3xl bg-white p-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">All face shape probabilities</summary>
        <ul className="mt-3 flex flex-col gap-2" aria-label="Probability for each face shape">
          {ranked.map((s) => (
            <li key={s} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-sm">
              <span className={s === shape.primary ? 'font-semibold' : ''}>{SHAPE_LABEL[s]}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-chip" aria-hidden="true">
                <span className={`block h-full rounded-full ${s === shape.primary ? 'bg-accent' : 'bg-accent/45'}`} style={{ width: pct(shape.probabilities[s]) }} />
              </span>
              <span className="text-right tabular-nums">{pct(shape.probabilities[s])}</span>
            </li>
          ))}
        </ul>
      </details>

      <button type="button" onClick={onShare} className="min-h-12 rounded-2xl bg-accent px-6 text-base font-semibold text-white">
        Make a share card
      </button>

      <section className="flex flex-col gap-1" aria-label="Lite mode">
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-accent" checked={lite} onChange={(e) => onLite(e.target.checked)} />
          Lite mode: a lighter camera for slower phones
        </label>
        <p className="text-xs text-muted">Uses a smaller camera picture and looks for your face fewer times a second. Frames may move a little less smoothly.</p>
      </section>

      <section className="flex flex-col gap-1" aria-label="Your picks">
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-accent" checked={remember} onChange={(e) => onRemember(e.target.checked)} />
          Remember my style picks on this device
        </label>
        <p className="text-xs text-muted">Only your style choice and likes are saved, never your photo or face data.</p>
        {hasPrefs(prefs) && (
          <button type="button" onClick={onClearPrefs} className="min-h-11 self-start rounded-2xl px-3 text-sm font-semibold text-accent">
            Clear my picks
          </button>
        )}
      </section>

      {onStudy && (
        <button type="button" onClick={onStudy} className="min-h-12 rounded-2xl bg-accent px-6 text-base font-semibold text-white">
          Rate these frames (study)
        </button>
      )}

      <ul className="flex flex-col gap-1 text-xs text-muted">
        {recs.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
        <li>Style suggestions, not rules.</li>
      </ul>
    </main>
  )
}

