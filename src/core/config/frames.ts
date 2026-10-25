// [tune] Frame style definitions (brief section 6.1). Each style is just data; the generator draws from it.
//
// Dimensions are in arbitrary, mm-like units (think "52-18" lens-bridge sizing). The generator
// rescales every frame so its front is the same width, so only the proportions matter.

export type FrameFamily =
  | 'round'
  | 'oval'
  | 'square'
  | 'rectangle'
  | 'wayfarer'
  | 'browline'
  | 'aviator'
  | 'cat-eye'
  | 'geometric'
  | 'oversized'

export type Rim = 'full' | 'half-top' | 'rimless'
export type BridgeType = 'saddle' | 'keyhole' | 'double' | 'high'
export type TempleStyle = 'straight' | 'thin-metal' | 'thick-acetate'
/** What the style is naturally built from. Any color can still be drawn on any style. */
export type Build = 'acetate' | 'metal' | 'mixed'

export interface FrameStyle {
  id: string
  name: string
  /** Used by the shape x frame compatibility matrix in M7. */
  family: FrameFamily
  lensW: number
  lensH: number
  /** Corner roundness 0..1 for the left lens: [outer-top, inner-top, inner-bottom, outer-bottom]. 1 = fully round. */
  corners: [number, number, number, number]
  /** Bottom edge narrows (positive) or widens (negative), -1..1. */
  taper: number
  /** Lifts the outer-top corner (cat-eye), 0..1. */
  upsweep: number
  /** 6 or 8 makes a hexagon or octagon instead of a four-corner lens. */
  polygon?: 6 | 8
  rim: Rim
  /** Rim thickness. */
  rimThickness: number
  /** Extra-thick top bar (wayfarer, browline). */
  browThickness?: number
  /** Acetate top bar over a metal lower rim. */
  twoTone?: boolean
  bridge: BridgeType
  bridgeW: number
  templeStyle: TempleStyle
  builds: Build[]
}

/** Real-world width of the frame front, in mm: both lenses, the bridge and one rim width. */
export const frameFrontMm = (s: FrameStyle) => 2 * s.lensW + s.bridgeW + s.rimThickness
/** Distance between the two lens centers, in mm. Compare with the wearer's pupil distance. */
export const lensCenterDistanceMm = (s: FrameStyle) => s.lensW + s.bridgeW

export const FRAME_STYLES: FrameStyle[] = [
  { id: 'round', name: 'Round', family: 'round', lensW: 46, lensH: 46, corners: [1, 1, 1, 1], taper: 0, upsweep: 0, rim: 'full', rimThickness: 3.2, bridge: 'saddle', bridgeW: 22, templeStyle: 'thin-metal', builds: ['metal', 'acetate'] },
  { id: 'panto', name: 'Panto', family: 'round', lensW: 48, lensH: 42, corners: [0.85, 0.8, 1, 1], taper: 0.12, upsweep: 0, rim: 'full', rimThickness: 3.6, bridge: 'saddle', bridgeW: 20, templeStyle: 'thin-metal', builds: ['acetate', 'metal'] },
  { id: 'oval', name: 'Oval', family: 'oval', lensW: 50, lensH: 38, corners: [1, 1, 1, 1], taper: 0.05, upsweep: 0, rim: 'full', rimThickness: 3, bridge: 'saddle', bridgeW: 18, templeStyle: 'thin-metal', builds: ['metal', 'acetate'] },
  { id: 'rectangle', name: 'Rectangle', family: 'rectangle', lensW: 54, lensH: 34, corners: [0.22, 0.22, 0.22, 0.22], taper: 0, upsweep: 0, rim: 'full', rimThickness: 3.4, bridge: 'saddle', bridgeW: 18, templeStyle: 'straight', builds: ['acetate', 'metal'] },
  { id: 'square', name: 'Square', family: 'square', lensW: 48, lensH: 44, corners: [0.2, 0.2, 0.25, 0.25], taper: 0, upsweep: 0, rim: 'full', rimThickness: 4, bridge: 'keyhole', bridgeW: 18, templeStyle: 'thick-acetate', builds: ['acetate'] },
  { id: 'wayfarer', name: 'Wayfarer', family: 'wayfarer', lensW: 52, lensH: 42, corners: [0.3, 0.2, 0.55, 0.55], taper: 0.2, upsweep: 0.06, rim: 'full', rimThickness: 6, browThickness: 5, bridge: 'keyhole', bridgeW: 18, templeStyle: 'thick-acetate', builds: ['acetate'] },
  { id: 'browline', name: 'Browline', family: 'browline', lensW: 52, lensH: 38, corners: [0.12, 0.12, 0.85, 0.85], taper: 0.1, upsweep: 0, rim: 'full', rimThickness: 2, browThickness: 6.5, twoTone: true, bridge: 'high', bridgeW: 18, templeStyle: 'thick-acetate', builds: ['mixed'] },
  { id: 'aviator', name: 'Aviator', family: 'aviator', lensW: 58, lensH: 50, corners: [0.95, 0.9, 0.85, 0.95], taper: 0.9, upsweep: 0, rim: 'full', rimThickness: 2, bridge: 'double', bridgeW: 16, templeStyle: 'thin-metal', builds: ['metal'] },
  { id: 'cat-eye', name: 'Cat-eye', family: 'cat-eye', lensW: 52, lensH: 40, corners: [0.3, 0.55, 0.7, 0.7], taper: 0.3, upsweep: 0.65, rim: 'full', rimThickness: 5, bridge: 'saddle', bridgeW: 17, templeStyle: 'thick-acetate', builds: ['acetate', 'mixed'] },
  { id: 'butterfly', name: 'Butterfly', family: 'oversized', lensW: 62, lensH: 54, corners: [0.8, 0.8, 0.9, 0.9], taper: 0.35, upsweep: 0.15, rim: 'full', rimThickness: 5, bridge: 'saddle', bridgeW: 16, templeStyle: 'thick-acetate', builds: ['acetate'] },
  { id: 'hexagon', name: 'Hexagon', family: 'geometric', lensW: 50, lensH: 44, corners: [0.12, 0.12, 0.12, 0.12], taper: 0, upsweep: 0, polygon: 6, rim: 'full', rimThickness: 3.4, bridge: 'saddle', bridgeW: 18, templeStyle: 'thin-metal', builds: ['metal', 'acetate'] },
  { id: 'octagon', name: 'Octagon', family: 'geometric', lensW: 48, lensH: 44, corners: [0.1, 0.1, 0.1, 0.1], taper: 0, upsweep: 0, polygon: 8, rim: 'full', rimThickness: 3.6, bridge: 'saddle', bridgeW: 18, templeStyle: 'thin-metal', builds: ['metal', 'acetate'] },
  { id: 'half-rim', name: 'Half-rim', family: 'rectangle', lensW: 52, lensH: 36, corners: [0.35, 0.35, 0.45, 0.45], taper: 0.05, upsweep: 0.05, rim: 'half-top', rimThickness: 3.4, bridge: 'saddle', bridgeW: 18, templeStyle: 'thin-metal', builds: ['metal', 'mixed'] },
  { id: 'rimless', name: 'Rimless', family: 'oval', lensW: 52, lensH: 40, corners: [0.6, 0.6, 0.7, 0.7], taper: 0.08, upsweep: 0, rim: 'rimless', rimThickness: 1.6, bridge: 'saddle', bridgeW: 18, templeStyle: 'thin-metal', builds: ['metal'] },
  { id: 'shield-lite', name: 'Shield lite', family: 'oversized', lensW: 60, lensH: 38, corners: [0.3, 0.2, 0.7, 0.8], taper: 0.3, upsweep: 0.05, rim: 'full', rimThickness: 3.4, browThickness: 4.5, bridge: 'high', bridgeW: 6, templeStyle: 'thick-acetate', builds: ['acetate', 'mixed'] },
  { id: 'wellington', name: 'Wellington', family: 'wayfarer', lensW: 50, lensH: 40, corners: [0.3, 0.3, 0.4, 0.4], taper: 0.15, upsweep: 0, rim: 'full', rimThickness: 7, bridge: 'keyhole', bridgeW: 20, templeStyle: 'thick-acetate', builds: ['acetate'] },
]

// Sizes only change how big the frame is made relative to the face (brief section 6.4);
// the picture is the same, so S/M/L share one raster.
export const SIZES = [
  { id: 'S', name: 'Small', fitFactor: 0.94 },
  { id: 'M', name: 'Medium', fitFactor: 1.0 },
  { id: 'L', name: 'Large', fitFactor: 1.06 },
] as const
export type SizeId = (typeof SIZES)[number]['id']

export const LENS_TINTS = [
  { id: 'clear', name: 'Clear' },
  { id: 'light-grey', name: 'Light grey' },
  { id: 'brown-gradient', name: 'Brown gradient' },
  { id: 'dark', name: 'Dark sunglass' },
] as const
export type LensTintId = (typeof LENS_TINTS)[number]['id']

export const FRAME_RENDER = {
  // Every frame front is rescaled to this width in the SVG.
  frontWidth: 1000,
  // Space around the frame in the SVG, for temple stubs and soft edges.
  padding: 60,
  templeStubLength: 70,
  // Bitmap width a frame is rasterized at, and how many bitmaps are kept in memory (LRU).
  rasterWidth: 640,
  cacheSize: 64,
}
