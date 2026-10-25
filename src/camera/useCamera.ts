import { useCallback, useEffect, useRef, useState } from 'react'
import { CAMERA, type CameraQuality } from '../core/config/camera'

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'denied' | 'unavailable' | 'error'

export function useCamera(quality: CameraQuality) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('starting')
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // Every start/stop bumps this. A start that finds it changed while it was waiting has been
  // superseded (React's dev double-mount, a fast remount, a retry) and must not touch anything.
  const runRef = useRef(0)

  const stop = useCallback(() => {
    runRef.current++
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const start = useCallback(async () => {
    stop()
    const run = runRef.current
    const q = CAMERA[quality]
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('No camera API', 'NotFoundError')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: CAMERA.facingMode,
          width: { ideal: q.idealWidth },
          height: { ideal: q.idealHeight },
        },
      })
      if (run !== runRef.current) {
        // Superseded while waiting: release this stream so the camera does not stay on.
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stop()
        return
      }
      video.srcObject = stream
      await video.play()
      if (run !== runRef.current) return
      setSize({ width: video.videoWidth, height: video.videoHeight })
      setStatus('ready')
    } catch (e) {
      if (run !== runRef.current) return
      const name = e instanceof DOMException ? e.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied')
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') setStatus('unavailable')
      else setStatus('error')
    }
  }, [quality, stop])

  useEffect(() => {
    void start()
    return stop
  }, [start, stop])

  const retry = useCallback(() => {
    setStatus('starting')
    return start()
  }, [start])

  return { videoRef, status, size, retry }
}
