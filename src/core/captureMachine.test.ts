import { describe, expect, it } from 'vitest'
import { advanceCapture, initialCaptureState } from './captureMachine'
import { CAPTURE as C } from './config/capture'

describe('advanceCapture', () => {
  it('waits for a steady gate, then counts down 3-2-1, then samples', () => {
    let s = initialCaptureState(0)
    let t = 0
    const step = (ready: boolean, collected = 0) => {
      const r = advanceCapture(s, { now: t, ready, collected })
      s = r.state
      return r
    }

    expect(step(true).state.phase).toBe('holding')
    t += C.holdMs - 1
    expect(step(true).state.phase).toBe('holding')
    t += 1
    const first = step(true)
    expect(first.state.phase).toBe('countdown')
    expect(first.countdown).toBe(3)

    t += 1000
    expect(step(true).countdown).toBe(2)
    t += 1000
    expect(step(true).countdown).toBe(1)
    t += 1000
    const cap = step(true)
    expect(cap.state.phase).toBe('capturing')
    expect(cap.wantSample).toBe(true)
  })

  it('cancels the countdown when the gate drops', () => {
    let s = initialCaptureState(0)
    s = advanceCapture(s, { now: 0, ready: true, collected: 0 }).state
    s = advanceCapture(s, { now: C.holdMs, ready: true, collected: 0 }).state
    expect(s.phase).toBe('countdown')
    const r = advanceCapture(s, { now: C.holdMs + 500, ready: false, collected: 0 })
    expect(r.state.phase).toBe('searching')
    expect(r.countdown).toBeNull()
  })

  it('restarts the hold if the gate flickers', () => {
    let s = initialCaptureState(0)
    s = advanceCapture(s, { now: 0, ready: true, collected: 0 }).state
    s = advanceCapture(s, { now: 200, ready: false, collected: 0 }).state
    expect(s.phase).toBe('searching')
  })

  it('samples at the configured interval and finishes at the target count', () => {
    let s = { phase: 'capturing' as const, since: 0, lastSampleAt: -Infinity }
    const a = advanceCapture(s, { now: 0, ready: true, collected: 0 })
    expect(a.wantSample).toBe(true)
    s = a.state as typeof s
    expect(advanceCapture(s, { now: C.sampleIntervalMs - 1, ready: true, collected: 1 }).wantSample).toBe(false)
    expect(advanceCapture(s, { now: C.sampleIntervalMs, ready: true, collected: 1 }).wantSample).toBe(true)
    expect(advanceCapture(s, { now: 500, ready: true, collected: C.frames }).outcome).toBe('done')
  })

  it('times out: done with enough frames, failed without', () => {
    const s = { phase: 'capturing' as const, since: 0, lastSampleAt: 0 }
    expect(advanceCapture(s, { now: C.timeoutMs, ready: true, collected: C.minFrames }).outcome).toBe('done')
    expect(advanceCapture(s, { now: C.timeoutMs, ready: true, collected: C.minFrames - 1 }).outcome).toBe('failed')
  })
})
