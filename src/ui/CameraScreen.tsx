import { useEffect, useRef, useState } from 'react'
import { drawOverlay, type IndexMode } from '../camera/drawOverlay'
import { getLandmarker, type LoadedLandmarker } from '../camera/landmarker'
import { useCamera } from '../camera/useCamera'
import { CAMERA, type CameraQuality } from '../core/config/camera'
import { DEBUG_OVERLAY } from '../core/config/debugOverlay'
import { LANDMARKER } from '../core/config/landmarker'
import { OverlayControls } from './OverlayControls'

const CAMERA_MESSAGES = {
  denied: 'Camera access was blocked. Allow the camera in your browser settings, or upload a photo instead.',
  unavailable: 'No usable camera was found on this device.',
  error: 'The camera could not be started. Close other apps that may be using it and try again.',
} as const

export function CameraScreen({ onBack, onPhoto }: { onBack: () => void; onPhoto: () => void }) {
  const [quality, setQuality] = useState<CameraQuality>('full')
  const [indexMode, setIndexMode] = useState<IndexMode>('key')
  const [showDots, setShowDots] = useState(true)
  const { videoRef, status, size, retry } = useCamera(quality)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  // Overlay options live in a ref so changing them never restarts the detection loop.
  const optsRef = useRef({ indexMode, showDots, quality })
  useEffect(() => {
    optsRef.current = { indexMode, showDots, quality }
  }, [indexMode, showDots, quality])

  const [model, setModel] = useState<LoadedLandmarker | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [stats, setStats] = useState({ fps: 0, face: false })

  // Load the model lazily, once, when this screen opens.
  useEffect(() => {
    let cancelled = false
    getLandmarker('VIDEO')
      .then((r) => {
        if (!cancelled) setModel(r)
      })
      .catch((e: unknown) => {
        console.error(e)
        if (!cancelled) {
          setModelError(
            `The face model could not be loaded (${e instanceof Error ? e.message : 'unknown error'}). ` +
              `Check that ${LANDMARKER.modelPath} exists.`,
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Detection + overlay loop.
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!model || status !== 'ready' || !video || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let lastVideoTime = -1
    let lastRun = 0
    let lastStatsAt = 0
    const stamps: number[] = []
    let faceNow = false

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return
      const cap = CAMERA[optsRef.current.quality].analysisFps
      if (cap && now - lastRun < 1000 / cap) return
      lastVideoTime = video.currentTime
      lastRun = now

      const result = model.landmarker.detectForVideo(video, now)
      const landmarks = result.faceLandmarks[0] ?? null
      faceNow = landmarks !== null

      stamps.push(now)
      while (stamps.length && now - (stamps[0] ?? now) > DEBUG_OVERLAY.fpsWindowMs) stamps.shift()

      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = Math.round(rect.width * dpr)
      const h = Math.round(rect.height * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawOverlay(ctx, landmarks, rect.width, rect.height, {
        showDots: optsRef.current.showDots,
        indexMode: optsRef.current.indexMode,
        pointer: pointerRef.current,
        mirror: true,
      })

      if (now - lastStatsAt > 500) {
        lastStatsAt = now
        setStats({ fps: Math.round((stamps.length * 1000) / DEBUG_OVERLAY.fpsWindowMs), face: faceNow })
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [model, status, videoRef])

  const setPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    pointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const camMessage = status === 'denied' || status === 'unavailable' || status === 'error' ? CAMERA_MESSAGES[status] : null
  const targetFps = quality === 'lite' ? LANDMARKER.liteTargetFps : LANDMARKER.targetFps
  const meetsTarget = stats.fps >= targetFps

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-8 pt-4">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Back
        </button>
        <h1 className="font-display text-base font-bold">Landmark check</h1>
        <button type="button" onClick={onPhoto} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">
          Photo
        </button>
      </header>

      <div
        ref={wrapRef}
        className="relative mx-auto w-full overflow-hidden rounded-3xl bg-ink"
        style={{ aspectRatio: size ? `${size.width} / ${size.height}` : '3 / 4', maxHeight: '65dvh' }}
        onPointerMove={setPointer}
        onPointerDown={setPointer}
        onPointerLeave={() => (pointerRef.current = null)}
      >
        <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        {(status === 'starting' || (status === 'ready' && !model && !modelError)) && (
          <p className="absolute inset-0 grid place-items-center bg-ink/60 px-6 text-center text-sm font-medium text-white" role="status">
            {status === 'starting' ? 'Starting camera...' : 'Loading face model...'}
          </p>
        )}
      </div>

      {camMessage && (
        <div role="alert" className="rounded-2xl bg-white p-4 text-sm text-ink">
          <p>{camMessage}</p>
          <button
            type="button"
            onClick={() => void retry()}
            className="mt-3 min-h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      )}
      {modelError && (
        <p role="alert" className="rounded-2xl bg-white p-4 text-sm text-ink">
          {modelError}
        </p>
      )}

      <dl className="grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="Detections / s" value={String(stats.fps)} ok={status === 'ready' && model ? meetsTarget : undefined} hint={`target ${targetFps}`} />
        <Stat label="Face" value={stats.face ? 'Found' : 'None'} ok={model && status === 'ready' ? stats.face : undefined} />
        <Stat label="Delegate" value={model?.delegate ?? '-'} />
      </dl>

      <OverlayControls indexMode={indexMode} onIndexMode={setIndexMode} showDots={showDots} onShowDots={setShowDots}>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={quality === 'lite'}
            onChange={(e) => setQuality(e.target.checked ? 'lite' : 'full')}
          />
          Lite mode
        </label>
      </OverlayControls>
    </main>
  )
}

function Stat({ label, value, ok, hint }: { label: string; value: string; ok?: boolean; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 font-display text-lg font-bold">
        {value}
        {ok !== undefined && <span className="sr-only">{ok ? ' (ok)' : ' (below target)'}</span>}
      </dd>
      <p className={`text-[11px] ${ok === false ? 'font-semibold text-warn' : 'text-muted'}`}>
        {ok === undefined ? hint ?? ' ' : ok ? 'OK' : hint ?? 'Low'}
      </p>
    </div>
  )
}
