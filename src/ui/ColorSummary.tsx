import type { ColorProfile, ConfidenceLevel } from '../core/colorProfile'
import { contrastText, DEPTH_LABEL, undertoneSentence } from './colorText'

const BADGE: Record<ConfidenceLevel, string> = {
  High: 'bg-chip text-chip-ink',
  Medium: 'bg-amber-100 text-amber-900',
  Low: 'bg-red-100 text-red-900',
}

/** The estimated skin color, as a swatch, with a plain-language "how sure" badge. Level is spelled out, never color alone. */
export function ColorSummary({ profile, onDetails }: { profile: ColorProfile | null; onDetails: () => void }) {
  return (
    <section className="rounded-3xl bg-white p-4" aria-label="Your colors">
      {profile ? (
        <div className="flex items-center gap-4">
          <span className="size-14 shrink-0 rounded-full border border-ink/20" style={{ background: profile.skinHex }} role="img" aria-label={`Estimated skin color ${profile.skinHex}`} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold">{DEPTH_LABEL[profile.depth]} skin</p>
            <p className="text-sm">{undertoneSentence(profile)}</p>
            <p className="text-sm text-muted">{contrastText(profile)}</p>
            <span className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold ${BADGE[profile.confidenceLevel]}`}>Confidence: {profile.confidenceLevel}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">We could not read your skin color from this photo. Try again in even light.</p>
      )}
      <button type="button" onClick={onDetails} className="mt-3 min-h-11 w-full rounded-2xl bg-chip px-5 text-sm font-semibold text-chip-ink">
        {profile ? 'See details' : 'Why?'}
      </button>
    </section>
  )
}

