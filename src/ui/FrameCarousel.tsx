import { FRAME_STYLES } from '../core/config/frames'

const ARROW = 'grid size-12 shrink-0 place-items-center rounded-full bg-white text-accent shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/**
 * Previous / next over the styles, in the order given (best match first).
 * Operable by keyboard: focus it and use the left and right arrows.
 */
export function FrameCarousel({
  ids,
  index,
  onChange,
  badge,
}: {
  /** Style ids in display order. */
  ids: readonly string[]
  index: number
  onChange: (i: number) => void
  /** Short label for the current style, such as "Top pick" or "Less suited". */
  badge?: string | null
}) {
  const n = ids.length
  const style = FRAME_STYLES.find((s) => s.id === ids[index])
  const go = (dir: 1 | -1) => onChange((index + dir + n) % n)

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label="Frame styles, best match first"
      tabIndex={0}
      className="flex items-center justify-between gap-3 rounded-3xl bg-white p-3 focus-visible:outline-2 focus-visible:outline-accent"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          go(1)
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          go(-1)
        }
      }}
    >
      <button type="button" className={ARROW} onClick={() => go(-1)} aria-label="Previous frame style">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </button>
      <div className="min-w-0 text-center" role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${n}`}>
        <p className="truncate font-display text-xl font-bold" aria-live="polite">{style?.name}</p>
        <p className="text-xs text-muted">
          #{index + 1} of {n} for you &middot; {style?.family}
        </p>
        {badge && <span className="mt-1 inline-block rounded-full bg-chip px-3 py-0.5 text-xs font-semibold text-chip-ink">{badge}</span>}
      </div>
      <button type="button" className={ARROW} onClick={() => go(1)} aria-label="Next frame style">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}
