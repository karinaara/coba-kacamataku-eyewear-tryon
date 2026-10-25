import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { describe, expect, it } from 'vitest'
import { EYE_CONTOUR_LEFT, EYE_CONTOUR_RIGHT, IRIS_RING_LEFT, IRIS_RING_RIGHT, KEY_INDICES, LM } from './landmarks'
import { LANDMARK_COUNT } from './config/landmarker'

type Conn = { start: number; end: number }
const indicesOf = (conns: Conn[]) => new Set(conns.flatMap((c) => [c.start, c.end]))

const OVAL = indicesOf(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL)
const RIGHT_EYE = indicesOf(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE)
const LEFT_EYE = indicesOf(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE)
const RIGHT_IRIS = indicesOf(FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS)
const LEFT_IRIS = indicesOf(FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS)
const LIPS = indicesOf(FaceLandmarker.FACE_LANDMARKS_LIPS)

describe('landmark index map vs. library connection sets', () => {
  it('all indices are valid mesh points', () => {
    for (const i of KEY_INDICES) {
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(LANDMARK_COUNT)
    }
  })

  it('outline points lie on the face oval', () => {
    for (const k of [
      'faceTop', 'chin', 'cheekRight', 'cheekLeft', 'foreheadRight', 'foreheadLeft',
      'jawRight', 'jawLeft', 'jawHighRight', 'jawHighLeft',
    ] as const) {
      expect(OVAL.has(LM[k]), `${k} (${LM[k]}) should be on the face oval`).toBe(true)
    }
  })

  it('the brief\'s original forehead pair 71/301 is NOT on the oval (why we use 54/284)', () => {
    expect(OVAL.has(71)).toBe(false)
    expect(OVAL.has(301)).toBe(false)
  })

  it('eye corners belong to the correct eye', () => {
    expect(RIGHT_EYE.has(LM.eyeRightOuter)).toBe(true)
    expect(RIGHT_EYE.has(LM.eyeRightInner)).toBe(true)
    expect(LEFT_EYE.has(LM.eyeLeftOuter)).toBe(true)
    expect(LEFT_EYE.has(LM.eyeLeftInner)).toBe(true)
  })

  it('iris centers sit directly before their ring (the library sets only list the ring)', () => {
    expect(LM.irisRight).toBe(Math.min(...RIGHT_IRIS) - 1)
    expect(LM.irisLeft).toBe(Math.min(...LEFT_IRIS) - 1)
  })

  it('eye contour and iris ring constants match the library sets', () => {
    expect(new Set(EYE_CONTOUR_RIGHT)).toEqual(RIGHT_EYE)
    expect(new Set(EYE_CONTOUR_LEFT)).toEqual(LEFT_EYE)
    expect(new Set(IRIS_RING_RIGHT)).toEqual(RIGHT_IRIS)
    expect(new Set(IRIS_RING_LEFT)).toEqual(LEFT_IRIS)
  })

  it('mouth corners are on the lips', () => {
    expect(LIPS.has(LM.mouthRight)).toBe(true)
    expect(LIPS.has(LM.mouthLeft)).toBe(true)
  })
})
