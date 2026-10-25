import type { IndexMode } from '../camera/drawOverlay'

const INDEX_MODES: { value: IndexMode; label: string }[] = [
  { value: 'key', label: 'Key points' },
  { value: 'near', label: 'Near finger' },
  { value: 'all', label: 'All 478' },
  { value: 'off', label: 'Off' },
]

interface Props {
  indexMode: IndexMode
  onIndexMode: (m: IndexMode) => void
  showDots: boolean
  onShowDots: (v: boolean) => void
  children?: React.ReactNode
}

export function OverlayControls({ indexMode, onIndexMode, showDots, onShowDots, children }: Props) {
  return (
    <section aria-labelledby="idx-label" className="rounded-3xl bg-white p-4">
      <h2 id="idx-label" className="mb-2 text-sm font-semibold">Index labels</h2>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="idx-label">
        {INDEX_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={indexMode === m.value}
            onClick={() => onIndexMode(m.value)}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ${
              indexMode === m.value ? 'bg-accent text-white' : 'bg-chip text-chip-ink'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5 accent-accent" checked={showDots} onChange={(e) => onShowDots(e.target.checked)} />
          Show all dots
        </label>
        {children}
      </div>
      <p className="mt-2 text-xs text-muted">
        "Near finger" labels only the points around your cursor or finger, which is the easiest way to read indices in a
        dense area. Orange dots are the landmarks the measurements use. Everything runs on this device.
      </p>
    </section>
  )
}
