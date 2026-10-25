import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { median } from '../core/color'
import { advanceCapture, initialCaptureState, type CapturePhase } from '../core/captureMachine'
import { CAPTURE } from '../core/config/capture'
import { QUALITY } from '../core/config/quality'
import type { Point3 } from '../core/landmarks'
import { medianLandmarks, selectInlierFrames } from '../core/medianLandmarks'
import { poseFromMatrix, type Pose } from '../core/pose'
import { evaluateQuality, isFrameUsable, type QualityReport } from '../core/quality'
import type { CaptureResult } from './captureResult'
import { grabPixels, snapshot } from './frameSampler'
import { getLandmarker, type LoadedLandmarker } from './landmarker'

export interface CaptureUi {
  phase: CapturePhase
  countdown: number | null
  collected: number
  faceFound: boolean
  report: QualityReport | null
  error: string | null
}

const INITIAL_UI: CaptureUi = { phase: 'searching', countdown: null, collected: 0, faceFound: false, report: null, error: null }

const RETRY_MESSAGE = 'We could not get a steady capture. Hold still, look at the camera, and try again.'

interface Sample {
  landmarks: Point3[]
  pose: Pose | null
}

/**
 * Runs landmark detection on the live video, evaluates the quality gate, and drives auto-capture.
 * `draw` is called on every detection (null when no face) so the screen can paint its own overlay.
 */
export function useCapture(
  videoRef: RefObject<HTMLVideoElement | null>,
  cameraReady: boolean,
  draw?: (landmarks: readonly Point3[] | null) => void,
  /** Detect at most this many times a second (lite mode). null = every video frame. */
  maxFps: number | null = null,
) {
  const [ui, setUi] = useState<CaptureUi>(INITIAL_UI)
  const [result, setResult] = useState<CaptureResult | null>(null)
  const [model, setModel] = useState<LoadedLandmarker | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [modelAttempt, setModelAttempt] = useState(0)
  const forceRef = useRef(false)
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
  }, [draw])

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
  }, [modelAttempt])

  /** Try loading the face model again after a failure (for example when the connection was down). */
  const reloadModel = useCallback(() => {
    setModelError(null)
    setModelAttempt((n) => n + 1)
  }, [])

  /** Skip the wait and start the countdown now, even if the gate is not green. */
  const captureNow = useCallback(() => {
    forceRef.current = true
  }, [])

  /** Throw the result away and start looking for a face again. */
  const reset = useCallback(() => {
    forceRef.current = false
    setResult(null)
    setUi(INITIAL_UI)
    setAttempt((a) => a + 1)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!model || !cameraReady || !video || result) return

    let raf = 0
    let lastVideoTime = -1
    let lastRunAt = -Infinity
    let reportAt = -Infinity
    let report: QualityReport | null = null
    let machine = initialCaptureState(performance.now())
    let samples: Sample[] = []
    let snap: HTMLCanvasElement | null = null
    let shown: CaptureUi = INITIAL_UI
    let error: string | null = null

    const push = (patch: Partial<CaptureUi>) => {
      const next = { ...shown, ...patch }
      const changed = (Object.keys(next) as (keyof CaptureUi)[]).some((k) => next[k] !== shown[k])
      if (changed) {
        shown = next
        setUi(next)
      }
    }

    const finalize = (): CaptureResult | null => {
      const keptIdx = selectInlierFrames(samples.map((s) => s.landmarks))
      if (keptIdx.length < CAPTURE.minFrames) return null
      const kept = keptIdx.map((i) => samples[i] as Sample)
      const landmarks = medianLandmarks(kept.map((s) => s.landmarks))
      const poses = kept.flatMap((s) => (s.pose ? [s.pose] : []))
      const pose: Pose | null = poses.length
        ? {
            yaw: median(poses.map((p) => p.yaw)),
            pitch: median(poses.map((p) => p.pitch)),
            roll: median(poses.map((p) => p.roll)),
          }
        : null
      const image = snap ?? snapshot(video)
      const quality = evaluateQuality({ landmarks, matrix: null, pose, image: grabPixels(image) }, 'camera')
      return {
        source: 'camera',
        landmarks,
        pose,
        image,
        framesKept: kept.length,
        framesRejected: samples.length - kept.length,
        quality,
      }
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return
      if (maxFps && now - lastRunAt < 1000 / maxFps) return
      lastVideoTime = video.currentTime
      lastRunAt = now

      const res = model.landmarker.detectForVideo(video, now)
      const landmarks = res.faceLandmarks[0] ?? null
      const matrix = res.facialTransformationMatrixes?.[0]?.data ?? null
      drawRef.current?.(landmarks)

      if (!landmarks) {
        report = null
      } else if (now - reportAt >= QUALITY.intervalMs) {
        reportAt = now
        report = evaluateQuality({ landmarks, matrix, image: grabPixels(video) }, 'camera')
      }
      const gateGreen = report !== null && now - reportAt <= QUALITY.maxReportAgeMs && report.ready

      const step = advanceCapture(machine, { now, ready: gateGreen || (forceRef.current && landmarks !== null), collected: samples.length })
      machine = step.state

      if (step.wantSample && landmarks && isFrameUsable(landmarks, matrix, video.videoWidth, video.videoHeight)) {
        samples.push({
          landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
          pose: matrix ? poseFromMatrix(matrix) : null,
        })
        if (!snap && samples.length >= Math.floor(CAPTURE.frames / 2)) snap = snapshot(video)
      }

      if (step.outcome) {
        forceRef.current = false
        const out = step.outcome === 'done' ? finalize() : null
        if (out) {
          cancelAnimationFrame(raf)
          setResult(out)
          return
        }
        error = RETRY_MESSAGE
        samples = []
        snap = null
      }
      if (machine.phase !== 'searching') error = null

      push({
        phase: machine.phase,
        countdown: step.countdown,
        collected: samples.length,
        faceFound: landmarks !== null,
        report: landmarks ? report : null,
        error,
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [model, cameraReady, result, attempt, videoRef, maxFps])

  return { ui, result, captureNow, reset, modelError, reloadModel, modelReady: model !== null, delegate: model?.delegate ?? null }
}
