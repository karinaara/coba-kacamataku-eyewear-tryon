import { useEffect, useRef, useState, type RefObject } from 'react'
import { computeFit, fitPointsFromLandmarks, type FitPoints } from '../core/fit'
import { SMOOTHING } from '../core/config/tryon'
import { poseFromMatrix } from '../core/pose'
import { OneEuro1D, PointSmoother } from '../core/smoothing'
import type { Drawer3D } from '../frames3d/drawerTypes'
import type { FrameBitmap } from '../frames/raster'
import { getLandmarker, type LoadedLandmarker } from './landmarker'
import { drawFrame } from './tryonDraw'

type PointName = Exclude<keyof FitPoints, 'irisDiameterPx'>
const POINT_NAMES: readonly PointName[] = ['irisRight', 'irisLeft', 'cheekRight', 'cheekLeft', 'bridge', 'noseTip']

interface TracePoint {
  t: number
  rawCx: number
  rawCy: number
  rawRot: number
  rawW: number
  cx: number
  cy: number
  rot: number
  w: number
}
declare global {
  interface Window {
    /** Dev only: per-frame raw vs smoothed placement, for measuring jitter. */
    __tryonTrace?: TracePoint[]
  }
}

/**
 * Live try-on: detect the face on every video frame, smooth the landmarks with a One Euro filter,
 * fit the frame, and draw it on `canvasRef` (which matches the video's pixel size).
 */
export function useTryOn(videoRef: RefObject<HTMLVideoElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>, cameraReady: boolean, entry: FrameBitmap | null, sizeFactor: number, maxFps: number | null = null, drawer: Drawer3D | null = null, view3d = false) {
  const [model, setModel] = useState<LoadedLandmarker | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [stats, setStats] = useState({ fps: 0, faceFound: false })
  // The draw loop reads these every frame, so changing the frame or size never restarts it.
  const latest = useRef({ entry, sizeFactor })
  useEffect(() => {
    latest.current = { entry, sizeFactor }
  }, [entry, sizeFactor])

  useEffect(() => {
    let cancelled = false
    getLandmarker('VIDEO')
      .then((m) => !cancelled && setModel(m))
      .catch((e: unknown) => {
        console.error(e)
        if (!cancelled) setModelError(`The face model could not be loaded (${e instanceof Error ? e.message : 'unknown error'}).`)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!model || !cameraReady || !video || !canvas) return
    // A canvas holds either a 2D or a WebGL context, never both. In 3D mode the drawer owns it.
    if (view3d && !drawer) return
    const ctx = view3d ? null : canvas.getContext('2d')
    if (!view3d && !ctx) return

    const points = new PointSmoother<PointName>(SMOOTHING.position)
    const yawFilter = new OneEuro1D(SMOOTHING.yaw)
    const irisFilter = new OneEuro1D(SMOOTHING.scale)
    let raf = 0
    let lastVideoTime = -1
    let lastRunAt = -Infinity
    let lastFaceAt = -Infinity
    let lastStatsAt = 0
    let faceFound = false
    const stamps: number[] = []
    if (import.meta.env.DEV) window.__tryonTrace = []

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return
      if (maxFps && now - lastRunAt < 1000 / maxFps) return
      lastRunAt = now
      lastVideoTime = video.currentTime
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }
      ctx?.clearRect(0, 0, canvas.width, canvas.height)

      const res = model.landmarker.detectForVideo(video, now)
      const landmarks = res.faceLandmarks[0]
      stamps.push(now)
      while (stamps.length && now - (stamps[0] ?? now) > 1000) stamps.shift()

      faceFound = landmarks !== undefined
      if (landmarks) {
        if (now - lastFaceAt > SMOOTHING.resetAfterMs) {
          points.reset()
          yawFilter.reset()
          irisFilter.reset()
          drawer?.reset()
        }
        lastFaceAt = now
        const tSec = now / 1000
        const rawPts = fitPointsFromLandmarks(landmarks, canvas.width, canvas.height)
        const smooth = { ...rawPts, irisDiameterPx: irisFilter.filter(rawPts.irisDiameterPx, tSec) }
        for (const k of POINT_NAMES) smooth[k] = points.smooth(k, rawPts[k], tSec)
        const matrix = res.facialTransformationMatrixes?.[0]?.data
        const rawYaw = matrix ? (poseFromMatrix(matrix)?.yaw ?? 0) : 0
        const yaw = yawFilter.filter(rawYaw, tSec)

        const { entry, sizeFactor: size } = latest.current
        if (drawer) {
          drawer.draw(landmarks, canvas.width, canvas.height, size, tSec)
        } else if (ctx && entry) {
          const placement = computeFit(smooth, yaw, entry.frame.frontBox.w, entry.frame.frontBox.h, size, entry.frame.frontMm)
          drawFrame(ctx, entry, placement)
          if (import.meta.env.DEV && window.__tryonTrace && window.__tryonTrace.length < 3000) {
            const raw = computeFit(rawPts, rawYaw, entry.frame.frontBox.w, entry.frame.frontBox.h, size, entry.frame.frontMm)
            window.__tryonTrace.push({ t: now, rawCx: raw.cx, rawCy: raw.cy, rawRot: raw.rotation, rawW: raw.frontWidthPx, cx: placement.cx, cy: placement.cy, rot: placement.rotation, w: placement.frontWidthPx })
          }
        }
      }

      if (!landmarks) drawer?.clear()

      if (now - lastStatsAt > 500) {
        lastStatsAt = now
        setStats({ fps: stamps.length, faceFound })
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [model, cameraReady, videoRef, canvasRef, maxFps, drawer, view3d])

  return { stats, modelError, ready: model !== null }
}

