// Builds a 3D frame (rims, lenses, bridge, temples) from the same style, color and lens tint the 2D generator uses.
// Procedural: no model files. Units are millimeters, x to the subject's left, y up, +z out of the face, origin at
// the middle of the lenses and the bridge. Geometry and materials only, so it also runs under Vitest (no DOM).

import * as THREE from 'three'
import type { FrameColor } from '../core/config/colors'
import type { FrameStyle, LensTintId } from '../core/config/frames'
import { TRYON3D } from '../core/config/tryon3d'
import { lensPoints } from '../frames/generate'
import { darken, hashString, mix, pairedMetal, seededRandom } from '../frames/materials'
import { ensureCcw, lensOutlines, offsetPolygon, type P2 } from '../frames/outline'

export interface FrameModel {
  group: THREE.Group
  /** Real width of the frame front in mm (the same number the 2D fit uses as its ruler input). */
  frontMm: number
  dispose: () => void
}

const M = TRYON3D.model
const v2 = (p: P2) => new THREE.Vector2(p.x, p.y)

// ---- materials ----

/** A small tortoiseshell tile made in code (RGBA bytes), repeated across the frame. */
function tortoiseTexture(color: FrameColor): THREE.DataTexture {
  const SIZE = 128
  const rand = seededRandom(hashString(color.id))
  const dark = darken(color.hex, 0.55)
  const mid = darken(color.hex, 0.25)
  const amber = mix(color.hex, '#E0A040', 0.55)
  const palette = [dark, mid, amber, color.hex, dark].map((h) => new THREE.Color(h))
  const data = new Uint8Array(SIZE * SIZE * 4)
  const base = new THREE.Color(color.hex)
  for (let i = 0; i < SIZE * SIZE; i++) {
    data[i * 4] = Math.round(base.r * 255)
    data[i * 4 + 1] = Math.round(base.g * 255)
    data[i * 4 + 2] = Math.round(base.b * 255)
    data[i * 4 + 3] = 255
  }
  for (let b = 0; b < 16; b++) {
    const cx = rand() * SIZE
    const cy = rand() * SIZE
    const rx = 8 + rand() * 22
    const ry = 5 + rand() * 13
    const rot = rand() * Math.PI
    const c = palette[Math.floor(rand() * palette.length)] as THREE.Color
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // Wrap-around distance so the tile repeats without seams.
        let dx = Math.abs(x - cx)
        let dy = Math.abs(y - cy)
        dx = Math.min(dx, SIZE - dx)
        dy = Math.min(dy, SIZE - dy)
        const u = (dx * cos + dy * sin) / rx
        const w = (-dx * sin + dy * cos) / ry
        if (u * u + w * w < 1) {
          const k = (y * SIZE + x) * 4
          data[k] = Math.round(c.r * 255)
          data[k + 1] = Math.round(c.g * 255)
          data[k + 2] = Math.round(c.b * 255)
        }
      }
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.repeat.set(1 / 40, 1 / 40) // world-mapped UVs are in mm
  tex.needsUpdate = true
  return tex
}

export function frameMaterial(color: FrameColor): THREE.MeshStandardMaterial {
  const hex = new THREE.Color(color.hex)
  switch (color.material) {
    case 'glossy':
      return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.22, metalness: 0 })
    case 'matte':
      return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.78, metalness: 0 })
    case 'tortoise':
      return new THREE.MeshStandardMaterial({ map: tortoiseTexture(color), roughness: 0.28, metalness: 0 })
    case 'translucent':
      return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.62 })
    case 'metal':
      return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3, metalness: 1 })
  }
}

function lensMaterial(tint: LensTintId): THREE.MeshStandardMaterial {
  const t = TRYON3D.lens[tint]
  return new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.05, metalness: 0, transparent: true, opacity: t.opacity, depthWrite: false, side: THREE.DoubleSide })
}

// ---- geometry helpers ----

function extrudeRing(outer: P2[], inner: P2[], depth: number, bevel: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(outer.map(v2))
  shape.holes.push(new THREE.Path(inner.map(v2)))
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 1 })
  g.translate(0, 0, -depth / 2)
  return g
}

function extrudeShape(pts: P2[], depth: number): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(v2)), { depth, bevelEnabled: false, curveSegments: 1 })
  g.translate(0, 0, -depth / 2)
  return g
}

function tube(points: THREE.Vector3[], radius: number): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5), Math.max(8, points.length * 6), radius, 8, false)
}

/** The run of consecutive outline points that satisfy `keep`, rotated so the run does not wrap around. */
function run(pts: P2[], keep: (p: P2) => boolean): number[] {
  const n = pts.length
  let start = pts.findIndex((p, i) => keep(p) && !keep(pts[(i + n - 1) % n] as P2))
  if (start < 0) start = 0
  const idx: number[] = []
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n
    if (!keep(pts[i] as P2)) break
    idx.push(i)
  }
  return idx
}

// ---- the frame ----

export function buildFrameModel(style: FrameStyle, color: FrameColor, tint: LensTintId): FrameModel {
  const s = style
  const R = s.rimThickness
  const B = s.bridgeW
  const H = s.lensH
  const W = s.lensW
  const thin = s.templeStyle === 'thin-metal' && R <= 3.8
  const depth = thin ? M.rimDepthThin : M.rimDepth
  const group = new THREE.Group()
  const mats: THREE.Material[] = []
  const track = <T extends THREE.Material>(m: T): T => {
    mats.push(m)
    return m
  }

  const body = track(frameMaterial(color))
  const lowerColor = s.twoTone ? pairedMetal(color) : color
  const lower = s.twoTone ? track(frameMaterial(lowerColor)) : body
  const lens = track(lensMaterial(tint))

  const add = (g: THREE.BufferGeometry, m: THREE.Material, order = 0) => {
    const mesh = new THREE.Mesh(g, m)
    mesh.renderOrder = order
    group.add(mesh)
    return mesh
  }

  const { left, right } = lensOutlines(s, M.lensSamples)
  const rimMat = s.rim === 'half-top' || s.rim === 'rimless' ? body : lower
  for (const L of [left, right]) {
    const inner = offsetPolygon(L, -R / 2)
    // Lens.
    add(extrudeShape(inner, 1.6), lens, 2)
    if (s.rim === 'full') {
      add(extrudeRing(offsetPolygon(L, R / 2), inner, depth, Math.min(0.5, R * 0.12)), rimMat)
    } else if (s.rim === 'half-top') {
      // A thick upper rim, and a thin wire (as in real half-rims) around the rest.
      const cutY = H / 2 - 0.38 * H // the 2D drawing cuts 38% of the lens height down from the top
      const idx = run(L, (p) => p.y >= cutY)
      if (idx.length >= 2) {
        const outer = offsetPolygon(L, R / 2)
        const inn = offsetPolygon(L, -R / 2)
        const strip = [...idx.map((i) => outer[i] as P2), ...idx.map((i) => inn[i] as P2).reverse()]
        add(extrudeShape(ensureCcw(strip), depth), body)
      }
      const wireMat = track(new THREE.MeshStandardMaterial({ color: '#8B93A0', roughness: 0.35, metalness: 1 }))
      add(extrudeRing(offsetPolygon(L, 0.45), offsetPolygon(L, -0.45), 1.0, 0), wireMat)
    }
  }

  // Extra-thick brow bar (wayfarer, browline, shield).
  const BT = s.browThickness ?? 0
  if (BT > 0) {
    const cx = -(B / 2 + W / 2)
    const pts = lensPoints(s, cx, W, H)
    const TL = pts.pts[0] as P2
    const TR = pts.pts[1] as P2
    // SVG-style coordinates (y down) turned into model space (y up).
    const quad: P2[] = [
      { x: TL.x - R * 0.15, y: TL.y - BT },
      { x: TR.x + R * 0.1, y: TR.y - BT * 0.85 },
      { x: TR.x, y: TR.y + R * 0.2 },
      { x: TL.x, y: TL.y + R * 0.2 },
    ].map((p) => ({ x: p.x, y: -p.y }))
    const mirrored = quad.map((p) => ({ x: -p.x, y: p.y }))
    add(extrudeShape(ensureCcw(quad), depth * 1.1), body)
    add(extrudeShape(ensureCcw(mirrored), depth * 1.1), body)
  }

  // Bridge, in the same shapes as the 2D drawing (SVG y is down, so heights are negated).
  const y0 = -H / 2
  const yb = (t: number) => -(y0 + t * H)
  const bw = B / 2 + R * 0.3
  const bp = s.rim === 'half-top' || s.rim === 'rimless' ? body : lower
  const arc = (x: number, yEnd: number, yPeak: number, mat: THREE.Material, r: number) => {
    const pts = [new THREE.Vector3(-x, yEnd, 0), new THREE.Vector3(-x * 0.5, (yEnd + yPeak) / 2 + (yPeak - yEnd) * 0.25, 0), new THREE.Vector3(0, yPeak, 0), new THREE.Vector3(x * 0.5, (yEnd + yPeak) / 2 + (yPeak - yEnd) * 0.25, 0), new THREE.Vector3(x, yEnd, 0)]
    add(tube(pts, r), mat)
  }
  switch (s.bridge) {
    case 'saddle':
      arc(bw, yb(0.3), yb(0.3) + 0.3 * H * 0.5, bp, Math.max(R * 0.4, M.bridgeRadius))
      break
    case 'keyhole':
      arc(bw, yb(0.32), yb(0.32) + 0.34 * H * 0.75, body, Math.max(R * 0.5, M.bridgeRadius))
      break
    case 'double':
      arc(bw + W * 0.18, yb(0.14), yb(0.14) + 0.2 * H * 0.5, bp, Math.max(R * 0.45, M.bridgeRadius))
      arc(bw, yb(0.4), yb(0.4) + 0.14 * H * 0.5, bp, Math.max(R * 0.35, M.bridgeRadius * 0.8))
      break
    case 'high':
      arc(bw, yb(0.12), yb(0.12) + 0.1 * H * 0.5, body, Math.max(R * 0.6, M.bridgeRadius))
      break
  }

  // Temples: from each hinge straight back, then bending down behind the ear.
  const TLx = lensPoints(s, -(B / 2 + W / 2), W, H).pts[0] as P2
  const hingeX = Math.abs(TLx.x) + R * 0.1
  const hingeY = -(y0 + 0.22 * H - s.upsweep * 0.3 * H)
  const z0 = -depth / 2
  const tr = M.templeRadius[s.templeStyle]
  const templeMat = s.templeStyle === 'thin-metal' && s.twoTone ? lower : body
  for (const sign of [-1, 1] as const) {
    const x = sign * hingeX
    const pts = [
      new THREE.Vector3(x, hingeY, z0),
      new THREE.Vector3(x, hingeY, z0 - M.templeStraightMm * 0.5),
      new THREE.Vector3(x, hingeY - 0.5, z0 - M.templeStraightMm),
      new THREE.Vector3(x * 0.985, hingeY - M.templeDropMm * 0.35, z0 - M.templeStraightMm - M.templeBendMm * 0.55),
      new THREE.Vector3(x * 0.96, hingeY - M.templeDropMm, z0 - M.templeStraightMm - M.templeBendMm),
    ]
    add(tube(pts, tr), templeMat)
  }

  // Rimless: little mounting screws where the temples and the bridge meet the lenses.
  if (s.rim === 'rimless') {
    const screw = new THREE.SphereGeometry(Math.max(1.1, R * 0.8), 10, 8)
    const m = body
    for (const p of [[-hingeX, hingeY], [hingeX, hingeY], [-B / 2, yb(0.3)], [B / 2, yb(0.3)]] as const) {
      const mesh = new THREE.Mesh(screw, m)
      mesh.position.set(p[0], p[1], 0)
      group.add(mesh)
    }
  }

  return {
    group,
    frontMm: 2 * s.lensW + s.bridgeW + s.rimThickness,
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
      for (const m of mats) {
        const map = (m as THREE.MeshStandardMaterial).map
        map?.dispose()
        m.dispose()
      }
    },
  }
}
