// [tune] Camera constraints and analysis rate.

export const CAMERA = {
  facingMode: 'user' as const,
  full: { idealWidth: 1280, idealHeight: 720, analysisFps: null as number | null },
  // "Lite mode": lower resolution, throttled analysis (brief section 3).
  lite: { idealWidth: 640, idealHeight: 480, analysisFps: 15 as number | null },
}

export type CameraQuality = 'full' | 'lite'

// If detection stays under slowFps for slowSeconds in full mode, the app offers lite mode.
export const SLOW_DEVICE = { slowFps: 12, slowSeconds: 3 }
