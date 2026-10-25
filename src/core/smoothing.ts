// One Euro filter (Casiez et al. 2012): low jitter when still, low lag when moving fast. Pure.

export interface OneEuroConfig {
  /** Cutoff (Hz) at rest. Lower = smoother and laggier when still. */
  minCutoff: number
  /** How much the cutoff rises with speed. Higher = less lag when moving. */
  beta: number
  /** Cutoff (Hz) for the speed estimate. */
  dCutoff: number
}

const alphaFor = (cutoffHz: number, dtSec: number) => {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / dtSec)
}

export class OneEuro1D {
  private x: number | null = null
  private dx = 0
  private t = 0

  private cfg: OneEuroConfig

  constructor(cfg: OneEuroConfig) {
    this.cfg = cfg
  }

  reset() {
    this.x = null
    this.dx = 0
  }

  /** `tSec` is a monotonic time in seconds. */
  filter(value: number, tSec: number): number {
    if (this.x === null) {
      this.x = value
      this.t = tSec
      return value
    }
    const dt = tSec - this.t > 1e-4 ? tSec - this.t : 1 / 60
    this.t = tSec
    const rawSpeed = (value - this.x) / dt
    this.dx += alphaFor(this.cfg.dCutoff, dt) * (rawSpeed - this.dx)
    const cutoff = this.cfg.minCutoff + this.cfg.beta * Math.abs(this.dx)
    this.x += alphaFor(cutoff, dt) * (value - this.x)
    return this.x
  }
}

export interface Vec2 {
  x: number
  y: number
}

/** Smooths a fixed set of named 2D points. */
export class PointSmoother<K extends string> {
  private filters = new Map<K, [OneEuro1D, OneEuro1D]>()
  private cfg: OneEuroConfig

  constructor(cfg: OneEuroConfig) {
    this.cfg = cfg
  }

  reset() {
    this.filters.forEach(([a, b]) => {
      a.reset()
      b.reset()
    })
  }

  smooth(name: K, p: Vec2, tSec: number): Vec2 {
    let f = this.filters.get(name)
    if (!f) {
      f = [new OneEuro1D(this.cfg), new OneEuro1D(this.cfg)]
      this.filters.set(name, f)
    }
    return { x: f[0].filter(p.x, tSec), y: f[1].filter(p.y, tSec) }
  }
}

