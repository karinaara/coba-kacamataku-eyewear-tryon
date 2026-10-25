import { COLOR_BY_ID } from '../core/config/colors'
import { FRAME_STYLES } from '../core/config/frames'
import type { Recommendations } from '../core/recommend'
import { matchLabel, sizeName } from './recText'

const styleName = (id: string) => FRAME_STYLES.find((s) => s.id === id)?.name ?? id
const colorName = (id: string) => COLOR_BY_ID.get(id)?.name ?? id

/** Frames and colors that may not suit the user, each with the reason, plus how much to trust the picks. */
export function AvoidList({ recs }: { recs: Recommendations }) {
  if (recs.avoidStyles.length === 0 && recs.avoidColors.length === 0) {
    return <p className="text-sm text-muted">Nothing stands out as a poor fit. Everything here is at least worth a try.</p>
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      {recs.avoidStyles.length > 0 && (
        <div>
          <h3 className="font-semibold">Styles</h3>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
            {recs.avoidStyles.map((a) => (
              <li key={a.rec.styleId}>
                <span className="font-medium">{styleName(a.rec.styleId)}:</span> {a.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {recs.avoidColors.length > 0 && (
        <div>
          <h3 className="font-semibold">Colors</h3>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
            {recs.avoidColors.map((a) => (
              <li key={a.rec.colorId}>
                <span className="font-medium">{colorName(a.rec.colorId)}:</span> {a.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** The "why these frames" block on the Why this? screen: top styles with their reasons, best colors, what to avoid. */
export function FrameReasons({ recs }: { recs: Recommendations }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="frames-heading">
      <h2 id="frames-heading" className="font-display text-lg font-bold">Why these frames?</h2>
      <p className="text-sm text-muted">
        Each frame is scored on how well its shape suits your face, how well its color suits your skin, eyes and hair, how well its size fits, and your own taste. Every score comes from a rule you can read below.
      </p>

      <ol className="flex flex-col gap-3" aria-label="Top frame styles">
        {recs.topStyles.map((s, i) => {
          const color = recs.bestColorFor(s.styleId)
          return (
            <li key={s.styleId} className="rounded-2xl bg-white p-4">
              <p className="text-xs font-semibold text-accent">#{i + 1} for you &middot; {matchLabel(s.score)}</p>
              <p className="font-display text-lg font-bold">
                {styleName(s.styleId)} in {colorName(color.colorId)}
              </p>
              <p className="text-sm text-muted">Suggested size: {sizeName(s.bestSize)}</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
                {[...s.reasons, ...color.reasons].slice(0, 4).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {[...s.cautions, ...color.cautions].length > 0 && (
                <p className="mt-2 text-sm text-warn">
                  Keep in mind: {[...s.cautions, ...color.cautions].slice(0, 2).join(' ')}
                </p>
              )}
            </li>
          )
        })}
      </ol>

      <div className="rounded-2xl bg-white p-4">
        <h3 className="text-sm font-semibold">Colors that suit you best</h3>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {recs.topColors.map((c) => (
            <li key={c.colorId}>
              <span className="font-medium">{colorName(c.colorId)}</span>
              {c.reasons[0] ? <span className="text-muted"> &middot; {c.reasons[0]}</span> : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl bg-white p-4">
        <h3 className="text-sm font-semibold">Might not suit you</h3>
        <div className="mt-2">
          <AvoidList recs={recs} />
        </div>
      </div>

      <ul className="flex flex-col gap-1 text-xs text-muted">
        {recs.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
        <li>These are style suggestions based on rules, not rules you must follow. Your own taste counts too.</li>
      </ul>
    </section>
  )
}
