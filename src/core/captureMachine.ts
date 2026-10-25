// Auto-capture state machine: wait for a steady green gate, count down 3-2-1, then collect frames.
// Pure and time-driven (callers pass `now`), so it is easy to test.

import { CAPTURE } from './config/capture'

export type CapturePhase = 'searching' | 'holding' | 'countdown' | 'capturing'

export interface CaptureState {
  phase: CapturePhase
  /** When the current phase began (ms). */
  since: number
  /** Last time a frame sample was requested while capturing. */
  lastSampleAt: number
}

export interface CaptureStepInput {
  now: number
  /** The quality gate is green (or the user forced a capture). */
  ready: boolean
  /** Valid frames collected so far (only used while capturing). */
  collected: number
}

export interface CaptureStep {
  state: CaptureState
  /** 3, 2, 1 during the countdown, otherwise null. */
  countdown: number | null
  /** Ask the caller to try to collect one frame now. */
  wantSample: boolean
  outcome: 'done' | 'failed' | null
}

export const initialCaptureState = (now = 0): CaptureState => ({ phase: 'searching', since: now, lastSampleAt: -Infinity })

export function advanceCapture(state: CaptureState, input: CaptureStepInput, cfg = CAPTURE): CaptureStep {
  const { now, ready, collected } = input
  const idle = (s: CaptureState): CaptureStep => ({ state: s, countdown: null, wantSample: false, outcome: null })

  switch (state.phase) {
    case 'searching':
      return idle(ready ? { ...state, phase: 'holding', since: now } : state)

    case 'holding':
      if (!ready) return idle({ ...state, phase: 'searching', since: now })
      if (now - state.since >= cfg.holdMs) return advanceCapture({ ...state, phase: 'countdown', since: now }, input, cfg)
      return idle(state)

    case 'countdown': {
      if (!ready) return idle({ ...state, phase: 'searching', since: now })
      const left = cfg.countdownMs - (now - state.since)
      if (left <= 0) {
        return advanceCapture({ phase: 'capturing', since: now, lastSampleAt: -Infinity }, input, cfg)
      }
      return { state, countdown: Math.ceil(left / 1000), wantSample: false, outcome: null }
    }

    case 'capturing': {
      if (collected >= cfg.frames) return { ...idle(initialCaptureState(now)), outcome: 'done' }
      if (now - state.since >= cfg.timeoutMs) {
        return { ...idle(initialCaptureState(now)), outcome: collected >= cfg.minFrames ? 'done' : 'failed' }
      }
      if (now - state.lastSampleAt >= cfg.sampleIntervalMs) {
        return { state: { ...state, lastSampleAt: now }, countdown: null, wantSample: true, outcome: null }
      }
      return idle(state)
    }
  }
}
