import { forwardRef, useEffect, useRef } from 'react'
import type { CaptureResult } from '../camera/captureResult'

/** The captured picture (mirrored for camera captures, like a selfie) with a canvas overlay on top. */
export const FacePhoto = forwardRef<
  HTMLCanvasElement,
  { result: CaptureResult; label: string; maxHeight?: string }
>(function FacePhoto({ result, label, maxHeight = '55dvh' }, overlayRef) {
  const photoRef = useRef<HTMLCanvasElement>(null)
  const { width, height } = result.image

  useEffect(() => {
    const photo = photoRef.current
    const ctx = photo?.getContext('2d')
    if (!photo || !ctx) return
    photo.width = width
    photo.height = height
    ctx.drawImage(result.image, 0, 0)
  }, [result, width, height])

  return (
    <div className="relative mx-auto w-full overflow-hidden rounded-3xl bg-ink" style={{ aspectRatio: `${width} / ${height}`, maxHeight }}>
      <canvas ref={photoRef} className={`h-full w-full ${result.source === 'camera' ? '-scale-x-100' : ''}`} role="img" aria-label={label} />
      <canvas ref={overlayRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
    </div>
  )
})
