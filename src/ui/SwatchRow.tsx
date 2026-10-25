import type { FrameColor } from '../core/config/colors'
import { swatchBackground, tickColor } from './swatch'

/**
 * The color picker under the carousel, best matches first. A selected swatch shows a ring and a tick,
 * and a best match carries a star, so neither depends on color alone.
 */
export function SwatchRow({
  colors,
  best,
  value,
  onChange,
}: {
  /** Colors in display order. */
  colors: readonly FrameColor[]
  /** Ids of the best matches (marked with a star). */
  best: ReadonlySet<string>
  value: string
  onChange: (id: string) => void
}) {
  const move = (dir: 1 | -1) => {
    const i = colors.findIndex((c) => c.id === value)
    const next = colors[(i + dir + colors.length) % colors.length] as FrameColor
    onChange(next.id)
    // Keep focus on the newly selected swatch.
    requestAnimationFrame(() => document.getElementById(`swatch-${next.id}`)?.focus())
  }
  const current = colors.find((c) => c.id === value)

  return (
    <section aria-labelledby="swatch-heading" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="swatch-heading" className="text-sm font-semibold">Frame color</h2>
        {current && (
          <p className="text-xs text-muted" aria-live="polite">
            {current.name}, {current.material}
            {best.has(current.id) ? ', best match' : ''}
          </p>
        )}
      </div>
      <div
        role="radiogroup"
        aria-labelledby="swatch-heading"
        className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-2 pt-1"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault()
            move(1)
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault()
            move(-1)
          }
        }}
      >
        {colors.map((c) => {
          const selected = c.id === value
          const star = best.has(c.id)
          return (
            <button
              key={c.id}
              id={`swatch-${c.id}`}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={star ? `${c.name}, best match` : c.name}
              title={star ? `${c.name} (best match)` : c.name}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(c.id)}
              className={`relative grid size-11 shrink-0 snap-start place-items-center rounded-full border border-ink/25 ${
                selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-ground' : ''
              }`}
              style={{ background: swatchBackground(c) }}
            >
              {selected && (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke={tickColor(c)} strokeWidth="3" aria-hidden="true">
                  <path d="m6 12.5 4 4L18 8" />
                </svg>
              )}
              {star && (
                <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-accent text-white" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="size-3" fill="currentColor">
                    <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
                  </svg>
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted">A star marks the colors that suit you best, shown first.</p>
    </section>
  )
}
