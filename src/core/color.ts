// sRGB <-> CIELAB (D65). Pure. M6 will build skin analysis on top of this.

export type Lab = readonly [L: number, a: number, b: number]

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

const XN = 0.95047
const YN = 1
const ZN = 1.08883
const EPS = 216 / 24389
const KAPPA = 24389 / 27

const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116)

/** r, g, b in 0..255 -> CIELAB with D65 white. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r / 255)
  const G = srgbToLinear(g / 255)
  const B = srgbToLinear(b / 255)
  const x = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B
  const z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B
  const fx = f(x / XN)
  const fy = f(y / YN)
  const fz = f(z / ZN)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const fInv = (t: number) => (t * t * t > EPS ? t * t * t : (116 * t - 16) / KAPPA)
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** CIELAB (D65) -> sRGB 0..255, clamped to the gamut. For showing an estimated color on screen. */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const X = XN * fInv(fx)
  const Y = YN * fInv(fy)
  const Z = ZN * fInv(fz)
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z
  const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z
  const bl = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z
  const to8 = (c: number) => Math.round(Math.min(1, Math.max(0, gamma(Math.min(1, Math.max(0, c))))) * 255)
  return [to8(r), to8(g), to8(bl)]
}

/** Rec. 709 luma on 0..255 values. */
export const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2
}

export const mean = (values: readonly number[]) =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : NaN
