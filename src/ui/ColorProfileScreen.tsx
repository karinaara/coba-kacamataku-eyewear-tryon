import { useEffect, useRef } from 'react'
import type { CaptureResult } from '../camera/captureResult'
import { drawOverlay } from '../camera/drawOverlay'
import { prepareOverlay } from '../camera/prepareOverlay'
import { COLOR } from '../core/config/color'
import { warmthFromHue, type ColorProfile, type UndertoneAnswers } from '../core/colorProfile'
import { CONFIDENCE_TEXT, contrastText, DEPTH_LABEL, pctText, UNDERTONE_LABEL, undertoneText } from './colorText'
import { FacePhoto } from './FacePhoto'

const EMPTY: UndertoneAnswers = { veins: 'unsure', jewelry: 'unsure', sun: 'unsure' }

const QUESTIONS: { key: keyof UndertoneAnswers; text: string; options: { value: string; label: string }[] }[] = [
  {
    key: 'veins',
    text: 'In daylight, the veins on your wrist look',
    options: [
      { value: 'blue', label: 'Blue or purple' },
      { value: 'green', label: 'Green' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    key: 'jewelry',
    text: 'Which jewelry looks better on you',
    options: [
      { value: 'silver', label: 'Silver' },
      { value: 'gold', label: 'Gold' },
      { value: 'unsure', label: 'Both or neither' },
    ],
  },
  {
    key: 'sun',
    text: 'In strong sun your skin usually',
    options: [
      { value: 'burn', label: 'Burns, rarely tans' },
      { value: 'tan', label: 'Tans easily' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
]

const chip = (on: boolean) =>
  `min-h-11 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? 'bg-accent text-white' : 'bg-chip text-chip-ink'}`

const labText = (l: readonly number[] | undefined) => (l ? `${l[0]!.toFixed(1)}, ${l[1]!.toFixed(1)}, ${l[2]!.toFixed(1)}` : 'not used')

/** The warm/cool scale: three labeled zones, a dark marker for you, a hollow tick for the photo alone when answers were blended. */
function UndertoneScale({ profile }: { profile: ColorProfile }) {
  const u = COLOR.undertone
  const cool = warmthFromHue(u.coolMaxHueDeg) * 100
  const warm = warmthFromHue(u.warmMinHueDeg) * 100
  return (
    <div>
      <div className="relative mt-4 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
        <span className="bg-sky-200" style={{ width: `${cool}%` }} />
        <span className="bg-stone-200" style={{ width: `${warm - cool}%` }} />
        <span className="bg-amber-200" style={{ width: `${100 - warm}%` }} />
      </div>
      <div className="relative -mt-5 h-7" aria-hidden="true">
        {profile.answersApplied && (
          <span className="absolute top-1 size-5 -translate-x-1/2 rounded-full border-2 border-ink/60 bg-white" style={{ left: `${profile.measured.warmth * 100}%` }} />
        )}
        <span className="absolute top-1 size-5 -translate-x-1/2 rounded-full border-2 border-white bg-ink shadow" style={{ left: `${profile.warmth * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs font-semibold text-muted" aria-hidden="true">
        <span>Cool</span>
        <span>Neutral</span>
        <span>Warm</span>
      </div>
    </div>
  )
}

export function ColorProfileScreen({
  result,
  profile,
  answers,
  headCovered,
  onAnswer,
  onClearAnswers,
  onHeadCovered,
  onBack,
  onRetake,
}: {
  result: CaptureResult
  profile: ColorProfile | null
  answers: UndertoneAnswers | null
  headCovered: boolean
  onAnswer: <K extends keyof UndertoneAnswers>(key: K, value: UndertoneAnswers[K]) => void
  onClearAnswers: () => void
  onHeadCovered: (v: boolean) => void
  onBack: () => void
  onRetake: () => void
}) {
  const overlayRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = overlayRef.current
    const prepared = canvas && prepareOverlay(canvas)
    if (!prepared) return
    drawOverlay(prepared.ctx, result.landmarks, prepared.w, prepared.h, { showDots: false, indexMode: 'off', pointer: null, mirror: result.source === 'camera', rois: true, hideDots: true })
  }, [result])

  const current = answers ?? EMPTY
  const lowConfidence = profile ? profile.confidence < COLOR.confidence.offerQuestions : false

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col lg:max-w-3xl gap-4 px-5 pb-10 pt-4">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">
          Back
        </button>
        <h1 className="font-display text-base font-bold">Your colors</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      {!profile ? (
        <section className="rounded-3xl bg-white p-5" role="alert">
          <p className="font-semibold">We could not read your skin color.</p>
          <p className="mt-1 text-sm text-muted">We need to see both cheeks clearly, in even light. Try again facing a window or a lamp.</p>
          <button type="button" onClick={onRetake} className="mt-3 min-h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-white">
            Retake
          </button>
        </section>
      ) : (
        <>
          <section className="rounded-3xl bg-white p-5" aria-labelledby="conf-heading">
            <div className="flex items-center gap-4">
              <span className="size-16 shrink-0 rounded-full border border-ink/20" style={{ background: profile.skinHex }} role="img" aria-label={`Estimated skin color ${profile.skinHex}`} />
              <div>
                <p className="text-xs text-muted">Estimated skin color</p>
                <p className="font-display text-xl font-bold">{DEPTH_LABEL[profile.depth]}</p>
                <p className="text-sm text-muted">{profile.skinHex.toUpperCase()}</p>
              </div>
            </div>
            <h2 id="conf-heading" className="mt-4 text-sm font-semibold">
              How sure are we: {profile.confidenceLevel} ({pctText(profile.confidence)})
            </h2>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-chip" role="img" aria-label={`Confidence ${pctText(profile.confidence)}`}>
              <div className="h-full rounded-full bg-accent" style={{ width: pctText(profile.confidence) }} />
            </div>
            <p className="mt-2 text-sm text-muted">{CONFIDENCE_TEXT[profile.confidenceLevel]} A photo gives an estimate, not a measurement.</p>
            {profile.warnings.length > 0 && (
              <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-sm">
                {profile.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {profile.confidenceLevel === 'Low' && (
              <button type="button" onClick={onRetake} className="mt-3 min-h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-white">
                Retake in better light
              </button>
            )}
          </section>

          <section className="rounded-3xl bg-white p-5" aria-labelledby="under-heading">
            <h2 id="under-heading" className="text-sm font-semibold">Undertone</h2>
            <p className="font-display text-xl font-bold">{undertoneText(profile)}</p>
            <p className="text-sm text-muted">The cool (pink) or warm (golden) tint under your skin color.</p>
            <UndertoneScale profile={profile} />
            <p className="mt-2 text-xs text-muted">
              {profile.answersApplied
                ? `Your answers are blended in (${pctText(profile.debug.blendWeight)} of the result). The photo alone said ${UNDERTONE_LABEL[profile.measured.undertone].toLowerCase()} (hollow dot).`
                : `From the photo alone. Confidence in this label: ${pctText(profile.undertoneConfidence)}.`}
            </p>
          </section>

          <details className="rounded-3xl bg-white p-5" open={lowConfidence}>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
              {lowConfidence ? 'Not sure about the photo? Answer 3 quick questions' : 'Refine with 3 quick questions'}
            </summary>
            <p className="mt-1 text-sm text-muted">Your answers are mixed with what the photo showed. The less sure the photo, the more they count.</p>
            <div className="mt-3 flex flex-col gap-4">
              {QUESTIONS.map((q) => (
                <fieldset key={q.key}>
                  <legend className="mb-2 text-sm font-medium">{q.text}</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.text}>
                    {q.options.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={current[q.key] === o.value}
                        className={chip(current[q.key] === o.value)}
                        onClick={() => onAnswer(q.key, o.value as never)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            {answers && (
              <button type="button" onClick={onClearAnswers} className="mt-3 min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">
                Clear my answers
              </button>
            )}
          </details>

          <section className="rounded-3xl bg-white p-5" aria-labelledby="contrast-heading">
            <h2 id="contrast-heading" className="text-sm font-semibold">Contrast</h2>
            <p className="font-display text-xl font-bold">{contrastText(profile)}</p>
            <p className="text-sm text-muted">How strongly your skin stands out from your hair and eyes.</p>
            <label className="mt-2 flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-5 accent-accent" checked={headCovered} onChange={(e) => onHeadCovered(e.target.checked)} />
              I wear a head covering (hijab, scarf, cap)
            </label>
            <p className="text-xs text-muted">
              {profile.hairSource === 'covered'
                ? 'Contrast uses your eyes only, since fabric is not your hair.'
                : profile.hairSource === 'skin-like'
                  ? 'We could not see hair above your forehead, so contrast uses your eyes only.'
                  : profile.hairSource === 'insufficient'
                    ? 'There was not enough picture above your head to see your hair.'
                    : 'Using your hair and eyes. If that area is a head covering, tick the box.'}
            </p>
          </section>

          <section aria-label="Sampled areas" className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Where we looked</h2>
            <FacePhoto ref={overlayRef} result={result} label="Your photo with the skin sampling areas outlined" maxHeight="34dvh" />
            <p className="text-xs text-muted">Outlined: both cheeks and the forehead. Eyes, brows, lips and nose are left out.</p>
          </section>

          <details className="rounded-3xl bg-white p-4">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Details for tuning</summary>
            <table className="mt-3 w-full text-left text-xs">
              <tbody>
                {(
                  [
                    ['Skin L*, a*, b*', labText(profile.skinLab)],
                    ['Skin before correction', labText(profile.debug.rawSkinLab)],
                    ['ITA (degrees)', profile.ita.toFixed(1)],
                    ['Hue angle (degrees)', profile.hueDeg.toFixed(1)],
                    ['Warmth, photo only', profile.measured.warmth.toFixed(2)],
                    ['Warmth, final', profile.warmth.toFixed(2)],
                    ['Right cheek (L, a, b; pixels)', profile.debug.skin.right ? `${labText(profile.debug.skin.right.lab)}; ${profile.debug.skin.right.count}` : 'not used'],
                    ['Left cheek', profile.debug.skin.left ? `${labText(profile.debug.skin.left.lab)}; ${profile.debug.skin.left.count}` : 'not used'],
                    ['Forehead', profile.debug.skin.forehead ? `${labText(profile.debug.skin.forehead.lab)}; ${profile.debug.skin.forehead.count}` : 'not used'],
                    ['Cheek difference: L*, a-b', `${profile.debug.skin.deltaL?.toFixed(1) ?? '-'}, ${profile.debug.skin.deltaAB?.toFixed(1) ?? '-'}`],
                    ['Hair (source)', `${labText(profile.hairLab)} (${profile.hairSource})`],
                    ['Iris', labText(profile.eyeLab)],
                    ['Eye white', labText(profile.scleraLab)],
                    ['Colour cast from eye white', profile.debug.castMagnitude?.toFixed(1) ?? 'not found'],
                    ['Cast correction applied (a, b)', `${profile.debug.appliedShift[0].toFixed(1)}, ${profile.debug.appliedShift[1].toFixed(1)} (strength ${COLOR.correction.strength})`],
                    ['Contrast delta L*', profile.contrastDeltaL?.toFixed(1) ?? '-'],
                    ...Object.entries(profile.factors).map(([k, v]) => [`Confidence factor: ${k}`, v.toFixed(2)] as [string, string]),
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <tr key={k} className="border-t border-ground align-top">
                    <th scope="row" className="py-1 pr-2 font-normal text-muted">{k}</th>
                    <td className="py-1 text-right font-semibold tabular-nums">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <p className="text-xs text-muted">
            These are estimates from one photo: your phone has already adjusted the colors, and results shift with lighting. Style suggestions, not rules.
          </p>
        </>
      )}
    </main>
  )
}


