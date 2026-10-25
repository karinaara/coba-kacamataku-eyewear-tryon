// The 3D try-on scene (browser only, WebGL). One orthographic camera in picture pixels, so the frame lines up with
// the video. Two invisible "occluders" write depth only: the face mesh (from the live landmarks) and a skull
// ellipsoid behind it. They hide the parts of the frame that are behind the head, such as the far temple.

import { FaceLandmarker } from '@mediapipe/tasks-vision'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { computeFit } from '../core/fit'
import { TRYON3D } from '../core/config/tryon3d'
import { fitPointsFromScene, headBasis, length, pointAt, trianglesFromEdges, type HeadBasis, type Vec3 } from '../core/headPose3d'
import { LM } from '../core/landmarks'
import type { FrameModel } from './model'

const S = TRYON3D.skull

let triangleCache: Uint16Array | null = null
/** Face-mesh triangles, recovered once from the library's tessellation edges. */
export function faceTriangles(): Uint16Array {
  triangleCache ??= trianglesFromEdges(FaceLandmarker.FACE_LANDMARKS_TESSELATION, 468)
  return triangleCache
}

export interface SceneInput {
  /** Smoothed landmarks in scene space (see headPose3d). */
  points: Float32Array
  width: number
  height: number
  /** Size factor from the S / M / L choice (0.94 / 1 / 1.06). */
  sizeFactor: number
  /** Smoothed iris diameter in pixels (the ruler). */
  irisPx: number
}

export interface SceneOptions {
  /** Draw the occluders in color so they can be checked by eye. */
  showOccluders?: boolean
}

export class TryOnScene {
  readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(0, 1, 1, 0, 1, 6000)
  private readonly faceMesh: THREE.Mesh
  private readonly skull: THREE.Mesh
  private readonly anchor = new THREE.Group()
  private model: FrameModel | null = null
  private frontMm = 140
  private lensH = 40
  private size = { w: 0, h: 0 }
  private readonly pmrem: THREE.PMREMGenerator
  private readonly envTarget: THREE.WebGLRenderTarget
  private readonly opts: SceneOptions

  constructor(canvas: HTMLCanvasElement, opts: SceneOptions = {}) {
    this.opts = opts
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(1)
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping

    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envTarget = this.pmrem.fromScene(new RoomEnvironment(), 0.04)
    this.scene.environment = this.envTarget.texture
    this.scene.environmentIntensity = TRYON3D.light.envIntensity

    this.scene.add(new THREE.AmbientLight(0xffffff, TRYON3D.light.ambient))
    const key = new THREE.DirectionalLight(0xffffff, TRYON3D.light.key)
    key.position.set(-300, 600, 900)
    this.scene.add(key)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(478 * 3), 3).setUsage(THREE.DynamicDrawUsage))
    geo.setIndex(new THREE.BufferAttribute(faceTriangles(), 1))
    this.faceMesh = new THREE.Mesh(geo, this.occluderMaterial(0xff00aa))
    this.faceMesh.frustumCulled = false
    this.faceMesh.renderOrder = -2
    this.scene.add(this.faceMesh)

    this.skull = new THREE.Mesh(new THREE.SphereGeometry(1, S.segments, S.segments), this.occluderMaterial(0x00aaff))
    this.skull.matrixAutoUpdate = false
    this.skull.frustumCulled = false
    this.skull.renderOrder = -2
    this.scene.add(this.skull)

    this.anchor.matrixAutoUpdate = false
    this.scene.add(this.anchor)
  }

  private occluderMaterial(color: number): THREE.MeshBasicMaterial {
    if (this.opts.showOccluders) return new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    return new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })
  }

  setModel(model: FrameModel | null, lensH: number) {
    if (this.model) {
      this.anchor.remove(this.model.group)
      this.model.dispose()
    }
    this.model = model
    this.lensH = lensH
    if (model) {
      this.frontMm = model.frontMm
      this.anchor.add(model.group)
    }
  }

  resize(w: number, h: number) {
    if (this.size.w === w && this.size.h === h) return
    this.size = { w, h }
    this.renderer.setSize(w, h, false)
    this.camera.left = 0
    this.camera.right = w
    this.camera.top = h
    this.camera.bottom = 0
    this.camera.position.set(0, 0, 3000)
    this.camera.updateProjectionMatrix()
  }

  /** Draws one frame. Returns false (and draws nothing) if the head axes could not be worked out. */
  render(input: SceneInput): boolean {
    const { points, width, height } = input
    this.resize(width, height)
    const basis = headBasis(points)
    if (!basis) {
      this.renderer.clear()
      return false
    }

    // Face mesh occluder.
    const attr = this.faceMesh.geometry.getAttribute('position') as THREE.BufferAttribute
    ;(attr.array as Float32Array).set(points.subarray(0, 478 * 3))
    attr.needsUpdate = true

    // Size and in-plane position come from the same fit as the 2D try-on (at zero yaw: the 3D model turns by itself).
    const fitPts = { ...fitPointsFromScene(points, height), irisDiameterPx: input.irisPx }
    const fit = computeFit(fitPts, 0, this.frontMm, this.lensH, input.sizeFactor, this.frontMm)
    const pxPerMm = fit.frontWidthPx / this.frontMm

    const irisMid = midpoint(pointAt(points, LM.irisRight), pointAt(points, LM.irisLeft))
    const back = TRYON3D.faceMeshBackMm * pxPerMm
    this.faceMesh.position.set(-basis.z[0] * back, -basis.z[1] * back, -basis.z[2] * back)
    const offset = TRYON3D.frontOffsetMm * pxPerMm
    const origin: Vec3 = [fit.cx + basis.z[0] * offset, height - fit.cy + basis.z[1] * offset, irisMid[2] + basis.z[2] * offset]
    this.anchor.matrix.makeBasis(vec(basis.x, pxPerMm), vec(basis.y, pxPerMm), vec(basis.z, pxPerMm)).setPosition(origin[0], origin[1], origin[2])
    this.anchor.matrixWorldNeedsUpdate = true

    this.updateSkull(points, basis, irisMid)
    this.renderer.render(this.scene, this.camera)
    return true
  }

  private updateSkull(points: Float32Array, b: HeadBasis, irisMid: Vec3) {
    const faceWidth = length([
      (points[LM.cheekLeft * 3] as number) - (points[LM.cheekRight * 3] as number),
      (points[LM.cheekLeft * 3 + 1] as number) - (points[LM.cheekRight * 3 + 1] as number),
      (points[LM.cheekLeft * 3 + 2] as number) - (points[LM.cheekRight * 3 + 2] as number),
    ])
    const c: Vec3 = [
      irisMid[0] - b.z[0] * faceWidth * S.centerBack + b.y[0] * faceWidth * S.centerUp,
      irisMid[1] - b.z[1] * faceWidth * S.centerBack + b.y[1] * faceWidth * S.centerUp,
      irisMid[2] - b.z[2] * faceWidth * S.centerBack + b.y[2] * faceWidth * S.centerUp,
    ]
    this.skull.matrix.makeBasis(vec(b.x, faceWidth * S.radiusX), vec(b.y, faceWidth * S.radiusY), vec(b.z, faceWidth * S.radiusZ)).setPosition(c[0], c[1], c[2])
    this.skull.matrixWorldNeedsUpdate = true
  }

  dispose() {
    this.setModel(null, this.lensH)
    this.faceMesh.geometry.dispose()
    ;(this.faceMesh.material as THREE.Material).dispose()
    this.skull.geometry.dispose()
    ;(this.skull.material as THREE.Material).dispose()
    this.envTarget.dispose()
    this.pmrem.dispose()
    this.renderer.dispose()
  }
}

const vec = (v: Vec3, s: number) => new THREE.Vector3(v[0] * s, v[1] * s, v[2] * s)
const midpoint = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
