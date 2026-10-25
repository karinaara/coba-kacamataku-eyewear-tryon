import { useCallback, useEffect, useRef, useState } from 'react'
import { drawOverlay } from '../camera/drawOverlay'
import type { CaptureResult } from '../camera/captureResult'
import { useCamera } from '../camera/useCamera'
import { useCapture } from '../camera/useCapture'
import { CAMERA } from '../core/config/camera'
import { CAPTURE } from '../core/config/capture'
import type { Point3 } from '../core/landmarks'
import { Checklist } from './Checklist'
import { MetricsTable } from './MetricsTable'

const CAMERA_MESSAGES = {
  denied: 'Camera access was blocked. Allow the camera in your browser settings, or upload a photo instead.',
  unavailable: 'No usable camera was found on this device. You can upload a photo instead.',
  error: 'The camera could not be started. Close other apps that may be using it and try again.',
} as const

interface Props {
  onCaptured: (r: CaptureResult) => void
  onBack: () => void
  onFile: (file: File) => void
  onDebug: () => void
  lite: boolean
  onLite: (on: boolean) => void
}

export function CaptureScreen({ onCaptured, onBack, onFile, onDebug, lite, onLite }: Props) {
  const quality = lite ? 'lite' : 'full'
  const { videoRef, status, size, retry } = useCamera(quality)
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showLandmarks, setShowLandmarks] = useState(false)
  const [showAreas, setShowAreas] = useState(false)
  const overlayRef = useRef({ showLandmarks, showAreas })
  useEffect(() => {
    overlayRef.current = { showLandmarks, showAreas }
  }, [showLandmarks, showAreas])

  const draw = useCallback((landmarks: readonly Point3[] | null) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const { showLandmarks: dots, showAreas: rois } = overlayRef.current
    if (!dots && !rois) {
      ctx.clearRect(0, 0, rect.width, rect.height)
      return
    }
    drawOverlay(ctx, landmarks, rect.width, rect.height, {
      showDots: true, indexMode: 'off', pointer: null, mirror: true, rois, hideDots: !dots,
    })
  }, [])

  const { ui, result, captureNow, modelError, reloadModel, modelReady } = useCapture(videoRef, status === 'ready', draw, CAMERA[quality].analysisFps)

  // Hand the result up as soon as it exists.
  useEffect(() => {
    if (result) onCaptured(result)
  }, [result, onCaptured])

  const camMessage = status === 'denied' || status === 'unavailable' || status === 'error' ? CAMERA_MESSAGES[status] : null
  const green = ui.report?.ready === true
  const capturing = ui.phase === 'capturing'
  const loading = status === 'starting' ? 'Starting camera...' : null
  const waiting = modelError ? modelError : status !== 'ready' ? 'Waiting for the camera...' : !modelReady ? 'Loading the face model. The first time takes a few seconds.' : 'Looking for your face...'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-8 pt-4">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">
          Back
        </button>
        <h1 className="font-display text-base font-bold">Scan your face</h1>
        <button type="button" onClick={onDebug} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">
          Debug
        </button>
      </header>

      <div
        className="relative mx-auto w-full overflow-hidden rounded-3xl bg-ink"
        style={{ aspectRatio: size ? `${size.width} / ${size.height}` : '3 / 4', maxHeight: '60dvh' }}
      >
        <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 aspect-[3/4] h-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] ${
            green || capturing ? 'border-solid border-teal-300' : 'border-dashed border-amber-400'
          }`}
          aria-hidden="true"
        />
        {ui.countdown !== null && (
          <p className="absolute inset-0 grid place-items-center font-display text-8xl font-bold text-white drop-shadow-lg" role="timer" aria-live="assertive">
            {ui.countdown}
          </p>
        )}
        {capturing && (
          <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white drop-shadow" role="status">
            Hold still... {Math.min(100, Math.round((ui.collected / CAPTURE.frames) * 100))}%
          </p>
        )}
        {loading && <p className="absolute inset-0 grid place-items-center bg-ink/60 text-sm font-medium text-white">{loading}</p>}
      </div>

      {camMessage && (
        <div role="alert" className="rounded-2xl bg-white p-4 text-sm">
          <p>{camMessage}</p>
          <button type="button" onClick={() => void retry()} className="mt-3 min-h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-white">
            Try again
          </button>
        </div>
      )}
      {modelError && (
        <div role="alert" className="rounded-2xl bg-white p-4 text-sm">
          <p>{modelError} Check your connection, then try again. You can also upload a photo once it loads.</p>
          <button type="button" onClick={reloadModel} className="mt-3 min-h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-white">
            Try loading again
          </button>
        </div>
      )}
      {ui.error && (
        <p role="alert" className="rounded-2xl bg-white p-4 text-sm">
          {ui.error}
        </p>
      )}

      <Checklist report={ui.faceFound ? ui.report : null} waiting={waiting} />

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={captureNow}
          disabled={!ui.faceFound || ui.phase === 'countdown' || capturing}
          className="min-h-11 rounded-2xl bg-chip px-5 text-sm font-semibold text-chip-ink disabled:opacity-50"
        >
          {green ? 'Capture now' : 'Capture anyway'}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="min-h-11 rounded-2xl px-5 text-sm font-semibold text-accent">
          Upload a photo instead
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload a photo"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) onFile(f)
          }}
        />
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5 accent-accent" checked={lite} onChange={(e) => onLite(e.target.checked)} />
        Lite mode: a lighter camera for slower phones
      </label>

      <details className="rounded-3xl bg-white p-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Details for tuning</summary>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5 accent-accent" checked={showLandmarks} onChange={(e) => setShowLandmarks(e.target.checked)} />
            Show landmarks
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5 accent-accent" checked={showAreas} onChange={(e) => setShowAreas(e.target.checked)} />
            Show sample areas
          </label>
        </div>
        {ui.report && ui.faceFound ? <MetricsTable report={ui.report} /> : <p className="text-xs text-muted">No face yet.</p>}
      </details>
    </main>
  )
}

