// Per-frame glue between the face landmarks and the 3D scene (browser only). Loaded on demand, so the 3D library is
// only downloaded when someone turns 3D on.

import { fitPointsFromScene, SceneSmoother, toScene } from '../core/headPose3d'
import { SMOOTHING } from '../core/config/tryon'
import type { Point3 } from '../core/landmarks'
import { OneEuro1D } from '../core/smoothing'
import { resolveSpec, type FrameSpec } from '../frames/catalog'
import type { Drawer3D } from './drawerTypes'
import { buildFrameModel } from './model'
import { TryOnScene, type SceneOptions } from './scene'

export class Frame3DDrawer implements Drawer3D {
  private readonly scene: TryOnScene
  private readonly smoother = new SceneSmoother()
  private readonly iris = new OneEuro1D(SMOOTHING.scale)
  private buffer: Float32Array | undefined
  private specKey = ''

  constructor(canvas: HTMLCanvasElement, opts?: SceneOptions) {
    this.scene = new TryOnScene(canvas, opts)
  }

  /** Builds the 3D frame for a spec. Does nothing if it is the same visual as before (size does not change the model). */
  setSpec(spec: FrameSpec) {
    const key = `${spec.styleId}|${spec.colorId}|${spec.tint}`
    if (key === this.specKey) return
    this.specKey = key
    const { style, color } = resolveSpec(spec)
    this.scene.setModel(buildFrameModel(style, color, spec.tint), style.lensH)
  }

  draw(landmarks: readonly Point3[], width: number, height: number, sizeFactor: number, tSec: number) {
    this.buffer = toScene(landmarks, width, height, this.buffer)
    const points = this.smoother.smooth(this.buffer)
    const irisPx = this.iris.filter(fitPointsFromScene(points, height).irisDiameterPx, tSec)
    this.scene.render({ points, width, height, sizeFactor, irisPx })
  }

  clear() {
    this.scene.renderer.clear()
  }

  reset() {
    this.smoother.reset()
    this.iris.reset()
  }

  dispose() {
    this.scene.dispose()
  }
}
