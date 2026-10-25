import { useEffect, useRef, useState } from 'react'
import { drawOverlay, type IndexMode } from '../camera/drawOverlay'
import { getLandmarker, type LoadedLandmarker } from '../camera/landmarker'
import type { Point3 } from '../core/landmarks'
import { OverlayControls } from './OverlayControls'

/** Runs the same landmark overlay on a picked photo, so indices can be checked without a live camera. */
export function PhotoScreen({ onBack }: { onBack: () => void }) {
  const [src, setSrc] = useState<string | null>(() => new URLSearchParams(location.search).get('photo'))
  const [indexMode, setIndexMode] = useState<IndexMode>('key')
  const [showDots, setShowDots] = useState(true)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [landmarks, setLandmarks] = useState<readonly Point3[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loadedRef = useRef<LoadedLandmarker | null>(null)

  useEffect(() => {
    getLandmarker('IMAGE')
      .then((r) => {
        loadedRef.current = r
      })
      .catch((e: unknown) => setMessage(`The face model could not be loaded (${e instanceof Error ? e.message : 'unknown error'}).`))
  }, [])

  // Object URLs created from picked files are released when replaced or on unmount.
  useEffect(() => () => { if (src?.startsWith('blob:')) URL.revokeObjectURL(src) }, [src])

  const analyze = async () => {
    const img = imgRef.current
    if (!img) return
    setMessage('Detecting face...')
    // The model loads in parallel with the image; wait for it if needed.
    for (let i = 0; i < 100 && !loadedRef.current; i++) await new Promise((r) => setTimeout(r, 100))
    const loaded = loadedRef.current
    if (!loaded) return
    const result = loaded.landmarker.detect(img)
    const lm = result.faceLandmarks[0] ?? null
    setLandmarks(lm)
    setMessage(lm ? `${lm.length} landmarks found (${loaded.delegate}).` : 'No face detected in this photo.')
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawOverlay(ctx, landmarks, rect.width, rect.height, { showDots, indexMode, pointer, mirror: false })
  }, [landmarks, showDots, indexMode, pointer])

  const track = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPointer({ x: e.clientX - r.left, y: e.clientY - r.top })
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-5 pb-8 pt-4">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">
          Back
        </button>
        <h1 className="font-display text-base font-bold">Photo check</h1>
        <span className="w-14" aria-hidden="true" />
      </header>

      <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-2xl bg-accent px-5 text-sm font-semibold text-white">
        Choose a photo
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            setLandmarks(null)
            setMessage(null)
            setSrc(URL.createObjectURL(f))
          }}
        />
      </label>

      {src && (
        <div className="relative w-full overflow-hidden rounded-3xl bg-ink" onPointerMove={track} onPointerDown={track} onPointerLeave={() => setPointer(null)}>
          <img ref={imgRef} src={src} alt="Selected photo with face landmarks drawn over it" onLoad={() => void analyze()} className="block h-auto w-full" />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        </div>
      )}
      {message && <p role="status" className="rounded-2xl bg-white p-4 text-sm">{message}</p>}

      <OverlayControls indexMode={indexMode} onIndexMode={setIndexMode} showDots={showDots} onShowDots={setShowDots} />
    </main>
  )
}
