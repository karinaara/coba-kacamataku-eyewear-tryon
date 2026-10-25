import { useEffect, useRef, useState } from 'react'
import { drawOverlay } from '../camera/drawOverlay'
import type { CaptureResult } from '../camera/captureResult'
import { Checklist } from './Checklist'
import { MetricsTable } from './MetricsTable'

/**
 * End of M2: proves the pipeline output (median landmarks + picture + gate report) for both camera
 * captures and uploads. M3 replaces this with the Analyzing and result screens.
 */
export function CapturedScreen({
  result,
  onRetake,
  onContinue,
}: {
  result: CaptureResult
  onRetake: () => void
  onContinue: () => void
}) {
  const photoRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [areas, setAreas] = useState(true)
  const [dots, setDots] = useState(true)
  const mirror = result.source === 'camera'
  const { width, height } = result.image

  useEffect(() => {
    const photo = photoRef.current
    const ctx = photo?.getContext('2d')
    if (!photo || !ctx) return
    photo.width = width
    photo.height = height
    ctx.drawImage(result.image, 0, 0)
  }, [result, width, height])

  useEffect(() => {
    const canvas = overlayRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawOverlay(ctx, result.landmarks, rect.width, rect.height, {
      showDots: true, indexMode: 'off', pointer: null, mirror, rois: areas, hideDots: !dots,
    })
  }, [result, mirror, areas, dots])

  const pose = result.pose
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-8 pt-4 lg:max-w-5xl lg:px-8">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onRetake} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">
          Retake
        </button>
        <h1 className="font-display text-base font-bold">Capture ready</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      <div className="relative mx-auto max-h-[60dvh] w-full overflow-hidden rounded-3xl bg-ink lg:sticky lg:top-4 lg:max-h-[80dvh]" style={{ aspectRatio: `${width} / ${height}` }}>
        <canvas ref={photoRef} className={`h-full w-full ${mirror ? '-scale-x-100' : ''}`} role="img" aria-label="Your captured photo with face landmarks drawn over it" />
        <canvas ref={overlayRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-4">
      <p className="rounded-2xl bg-white p-4 text-sm" role="status">
        {result.source === 'camera'
          ? `Median of ${result.framesKept} frames (${result.framesRejected} rejected).`
          : 'Uploaded photo, analyzed as a single frame.'}{' '}
        {pose && `Head pose: yaw ${pose.yaw.toFixed(1)}, pitch ${pose.pitch.toFixed(1)}, roll ${pose.roll.toFixed(1)} degrees. `}
        Nothing leaves this device.
      </p>

      <Checklist report={result.quality} />
      {result.source === 'upload' && (
        <p className="text-xs text-muted">For uploads these checks only advise. You can still continue with this photo.</p>
      )}

      <button type="button" onClick={onContinue} className="min-h-12 rounded-2xl bg-accent px-6 text-base font-semibold text-white">
        Continue
      </button>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5 accent-accent" checked={dots} onChange={(e) => setDots(e.target.checked)} />
          Show landmarks
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5 accent-accent" checked={areas} onChange={(e) => setAreas(e.target.checked)} />
          Show sample areas
        </label>
      </div>

      <details className="rounded-3xl bg-white p-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Details for tuning</summary>
        <MetricsTable report={result.quality} />
      </details>
      </div>
      </div>
    </main>
  )
}

