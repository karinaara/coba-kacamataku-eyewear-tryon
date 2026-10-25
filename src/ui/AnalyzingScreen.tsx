import { useEffect, useRef, useState } from 'react'
import type { CaptureResult } from '../camera/captureResult'
import { drawMeasureLines, drawOverlay } from '../camera/drawOverlay'
import { MEASURE_LINES } from '../core/measure'
import { prepareOverlay } from '../camera/prepareOverlay'
import { FacePhoto } from './FacePhoto'

const STEP_MS = 700
const FINISH_MS = 500

/**
 * Screen 3. The analysis itself is instant; this screen reveals the real measurement lines one by
 * one so the user can see what was measured. The bar fills with the lines drawn.
 */
export function AnalyzingScreen({ result, onDone }: { result: CaptureResult; onDone: () => void }) {
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [reduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [shown, setShown] = useState(reduced ? MEASURE_LINES.length : 0)
  const total = MEASURE_LINES.length

  useEffect(() => {
    if (shown >= total) {
      const t = setTimeout(onDone, reduced ? 300 : FINISH_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setShown((n) => n + 1), STEP_MS)
    return () => clearTimeout(t)
  }, [shown, total, onDone, reduced])

  useEffect(() => {
    const canvas = overlayRef.current
    const prepared = canvas && prepareOverlay(canvas)
    if (!prepared) return
    const { ctx, w, h } = prepared
    const mirror = result.source === 'camera'
    drawOverlay(ctx, result.landmarks, w, h, { showDots: true, indexMode: 'off', pointer: null, mirror, hideDots: false })
    // Fade the dots back so the measurement lines stand out.
    ctx.fillStyle = 'rgba(17,24,39,0.35)'
    ctx.fillRect(0, 0, w, h)
    drawMeasureLines(ctx, result.landmarks, w, h, mirror, shown)
  }, [result, shown])

  const current = shown > 0 ? MEASURE_LINES[Math.min(shown, total) - 1]?.label : null
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col lg:max-w-lg gap-5 px-5 pb-8 pt-8">
      <h1 className="font-display text-2xl font-bold">Measuring your face</h1>
      <FacePhoto ref={overlayRef} result={result} label="Your photo with measurement lines being drawn over your face" />
      <div role="status" aria-live="polite" className="text-sm text-muted">
        {shown >= total ? 'Done. Working out your face shape...' : current ? `Measuring: ${current}` : 'Getting ready...'}
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-chip"
        role="progressbar"
        aria-label="Measurements drawn"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(shown, total)}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(Math.min(shown, total) / total) * 100}%` }} />
      </div>
      <p className="text-xs text-muted">Everything runs on this device. Your photo is not uploaded.</p>
    </main>
  )
}
