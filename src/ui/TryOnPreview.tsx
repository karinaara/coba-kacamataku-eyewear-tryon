import { useEffect, useRef, useState } from 'react'
import type { CaptureResult } from '../camera/captureResult'
import { CAMERA, SLOW_DEVICE } from '../core/config/camera'
import { useCamera } from '../camera/useCamera'
import { useTryOn } from '../camera/useTryOn'
import { drawFrame } from '../camera/tryonDraw'
import { computeFit, fitPointsFromLandmarks } from '../core/fit'
import type { FrameSpec } from '../frames/catalog'
import type { FrameBitmap } from '../frames/raster'
import { useDrawer3D } from './useDrawer3D'

interface Shared {
  entry: FrameBitmap | null
  sizeFactor: number
  /** 3D only: which frame to build. */
  spec?: FrameSpec | null
  view3d?: boolean
  /** WebGL or the 3D library is not available: the parent switches back to 2D and says why. */
  on3dFailed?: (reason: string) => void
}

const noop = () => undefined

/** Live camera with the frame tracking the head. Tells the parent if the camera cannot be used. */
export function LivePreview({
  entry,
  sizeFactor,
  spec = null,
  view3d = false,
  on3dFailed = noop,
  lite,
  onLite,
  onUnavailable,
}: Shared & { lite: boolean; onLite: (on: boolean) => void; onUnavailable: (reason: string) => void }) {
  const { videoRef, status, size } = useCamera(lite ? 'lite' : 'full')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { drawer, failed } = useDrawer3D(canvasRef, view3d, spec)
  const { stats, modelError, ready } = useTryOn(videoRef, canvasRef, status === 'ready', entry, sizeFactor, CAMERA[lite ? 'lite' : 'full'].analysisFps, drawer, view3d)

  useEffect(() => {
    if (failed) on3dFailed(`3D could not start on this device (${failed}). Showing the flat view instead.`)
  }, [failed, on3dFailed])
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (status === 'denied') onUnavailable('Camera access was blocked, so here is your captured photo instead.')
    else if (status === 'unavailable' || status === 'error') onUnavailable('The camera could not be started, so here is your captured photo instead.')
  }, [status, onUnavailable])

  // Offer lite mode if detection keeps running slowly in full mode. Stats arrive twice a second.
  const slowTicks = useRef(0)
  useEffect(() => {
    if (lite || !stats.faceFound || stats.fps === 0 || stats.fps >= SLOW_DEVICE.slowFps) slowTicks.current = 0
    else slowTicks.current++
    setSlow(slowTicks.current >= SLOW_DEVICE.slowSeconds * 2)
  }, [stats, lite])

  return (
    <div className="flex flex-col gap-2">
      <div className="relative mx-auto max-h-[46dvh] w-full overflow-hidden rounded-3xl bg-ink lg:max-h-[72dvh]" style={{ aspectRatio: size ? `${size.width} / ${size.height}` : '4 / 3' }}>
        <div className="absolute inset-0 -scale-x-100">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {/* A new canvas for each mode: one canvas cannot switch between 2D and WebGL. */}
          <canvas key={view3d ? 'gl' : '2d'} ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        </div>
        {status === 'starting' && <p className="absolute inset-0 grid place-items-center bg-ink/60 text-sm font-medium text-white" role="status">Starting camera...</p>}
        {status === 'ready' && !ready && !modelError && (
          <p className="absolute inset-0 grid place-items-center bg-ink/60 px-6 text-center text-sm font-medium text-white" role="status">
            Loading the face model. The first time takes a few seconds.
          </p>
        )}
        {status === 'ready' && ready && !stats.faceFound && (
          <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white drop-shadow" role="status">
            Look at the camera so the frames can find your face.
          </p>
        )}
        {modelError && (
          <p className="absolute inset-0 grid place-items-center bg-ink/70 px-6 text-center text-sm font-medium text-white" role="alert">
            {modelError} Check your connection and reload the page.
          </p>
        )}
      </div>
      {slow && (
        <p role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3 text-sm">
          Running slowly on this device?
          <button type="button" onClick={() => onLite(true)} className="min-h-11 rounded-2xl bg-accent px-4 text-sm font-semibold text-white">
            Turn on lite mode
          </button>
        </p>
      )}
    </div>
  )
}

/** Your captured photo with the frame placed from the median landmarks (no smoothing needed). */
export function PhotoPreview({ result, entry, sizeFactor, spec = null, view3d = false, on3dFailed = noop }: Shared & { result: CaptureResult }) {
  const photoRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const { width, height } = result.image
  const { drawer, failed } = useDrawer3D(overlayRef, view3d, spec)

  useEffect(() => {
    if (failed) on3dFailed(`3D could not start on this device (${failed}). Showing the flat view instead.`)
  }, [failed, on3dFailed])

  // 3D: one render from the median landmarks of the capture.
  useEffect(() => {
    if (!view3d || !drawer) return
    drawer.reset()
    drawer.clear()
    drawer.draw(result.landmarks, width, height, sizeFactor, 0)
  }, [view3d, drawer, result, sizeFactor, width, height, spec])

  useEffect(() => {
    const c = photoRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    c.width = width
    c.height = height
    ctx.drawImage(result.image, 0, 0)
  }, [result, width, height])

  useEffect(() => {
    const c = overlayRef.current
    if (view3d) return
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    c.width = width
    c.height = height
    ctx.clearRect(0, 0, width, height)
    if (!entry) return
    const points = fitPointsFromLandmarks(result.landmarks, width, height)
    drawFrame(ctx, entry, computeFit(points, result.pose?.yaw ?? 0, entry.frame.frontBox.w, entry.frame.frontBox.h, sizeFactor, entry.frame.frontMm))
  }, [result, entry, sizeFactor, width, height, view3d])

  return (
    <div className="relative mx-auto max-h-[46dvh] w-full overflow-hidden rounded-3xl bg-ink lg:max-h-[72dvh]" style={{ aspectRatio: `${width} / ${height}` }}>
      <div className={`absolute inset-0 ${result.source === 'camera' ? '-scale-x-100' : ''}`}>
        <canvas ref={photoRef} className="h-full w-full" role="img" aria-label="Your photo with the selected glasses on" />
        <canvas key={view3d ? 'gl' : '2d'} ref={overlayRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      </div>
    </div>
  )
}

