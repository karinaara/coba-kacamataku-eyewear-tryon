import { useEffect, useMemo, useRef, useState } from 'react'
import { FRAME_COLORS } from '../core/config/colors'
import { FRAME_STYLES, LENS_TINTS } from '../core/config/frames'
import { FIXTURES } from '../core/fixtures'
import { eulerDegrees, headBasis, toScene } from '../core/headPose3d'
import type { Point3 } from '../core/landmarks'
import type { FrameSpec } from '../frames/catalog'
import { useDrawer3D } from './useDrawer3D'

/** Turns the landmarks about the vertical axis through the nose bridge, as if the head had turned (the picture does not). */
function rotated(lm: readonly Point3[], w: number, h: number, yawDeg: number, pitchDeg: number): Point3[] {
  const pts = toScene(lm, w, h)
  const pivot = { x: pts[168 * 3] as number, y: pts[168 * 3 + 1] as number, z: (pts[168 * 3 + 2] as number) - 0.35 * w * 0.15 }
  const ry = (yawDeg * Math.PI) / 180
  const rx = (pitchDeg * Math.PI) / 180
  return lm.map((_, i) => {
    let x = (pts[i * 3] as number) - pivot.x
    let y = (pts[i * 3 + 1] as number) - pivot.y
    let z = (pts[i * 3 + 2] as number) - pivot.z
    ;[x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)]
    ;[y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)]
    return { x: (x + pivot.x) / w, y: 1 - (y + pivot.y) / h, z: -(z + pivot.z) / w }
  })
}

/**
 * Developer page (`?three`, dev server only): the 3D frame on a saved real face (landmarks only) with the photo behind,
 * and sliders that turn the landmarks synthetically. Used to check the head axes, the occluders and the temples by eye.
 * The photo does not turn with the sliders: only the landmarks and the frame do.
 */
export function ThreeDevScreen({ onBack }: { onBack: () => void }) {
  const fx = FIXTURES[0]!
  const { width: w, height: h } = fx.size
  const [yaw, setYaw] = useState(0)
  const [pitch, setPitch] = useState(0)
  const [styleId, setStyleId] = useState('wayfarer')
  const [colorId, setColorId] = useState('havana-tortoise')
  const [tint, setTint] = useState<(typeof LENS_TINTS)[number]['id']>('light-grey')
  const [occluders, setOccluders] = useState(false)
  const [photoOn, setPhotoOn] = useState(true)
  const photoRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<HTMLCanvasElement>(null)
  const spec = useMemo<FrameSpec>(() => ({ styleId, colorId, tint, size: 'M' }), [styleId, colorId, tint])
  const { drawer, failed } = useDrawer3D(glRef, true, spec, occluders)
  const src = new URLSearchParams(location.search).get('three') || '/dev/test1.jpg'

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const c = photoRef.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      c.width = w
      c.height = h
      ctx.drawImage(img, 0, 0, w, h)
    }
    img.src = src
  }, [src, w, h])

  const lm = useMemo(() => rotated(fx.landmarks, w, h, yaw, pitch), [fx, w, h, yaw, pitch])
  const euler = useMemo(() => {
    const b = headBasis(toScene(lm, w, h))
    return b ? eulerDegrees(b) : null
  }, [lm, w, h])

  useEffect(() => {
    if (!drawer) return
    drawer.reset()
    drawer.clear()
    drawer.draw(lm, w, h, 1, 0)
  }, [drawer, lm, w, h, spec])

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 p-4">
      <button type="button" onClick={onBack} className="min-h-11 self-start text-sm font-semibold text-accent">Back</button>
      <div className="relative w-full overflow-hidden rounded-3xl bg-ink" style={{ aspectRatio: `${w} / ${h}` }}>
        <canvas ref={photoRef} className="h-full w-full" style={{ opacity: photoOn ? 1 : 0.15 }} aria-hidden="true" />
        <canvas ref={glRef} id="three-gl" className="absolute inset-0 h-full w-full" aria-hidden="true" />
      </div>
      <p className="text-xs" id="three-status">
        {failed ? `Failed: ${failed}` : drawer ? 'ready' : 'loading 3D'} | head axes from landmarks: yaw {euler?.yaw.toFixed(1)} pitch {euler?.pitch.toFixed(1)} roll {euler?.roll.toFixed(1)}
      </p>
      <label className="text-sm">Yaw {yaw}<input aria-label="Yaw" type="range" min={-60} max={60} value={yaw} onChange={(e) => setYaw(+e.target.value)} className="w-full" /></label>
      <label className="text-sm">Pitch {pitch}<input aria-label="Pitch" type="range" min={-30} max={30} value={pitch} onChange={(e) => setPitch(+e.target.value)} className="w-full" /></label>
      <select aria-label="Style" value={styleId} onChange={(e) => setStyleId(e.target.value)} className="min-h-11 rounded-xl border p-2">
        {FRAME_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select aria-label="Color" value={colorId} onChange={(e) => setColorId(e.target.value)} className="min-h-11 rounded-xl border p-2">
        {FRAME_COLORS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select aria-label="Tint" value={tint} onChange={(e) => setTint(e.target.value as typeof tint)} className="min-h-11 rounded-xl border p-2">
        {LENS_TINTS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={occluders} onChange={(e) => setOccluders(e.target.checked)} /> Show occluders (wireframe)</label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={photoOn} onChange={(e) => setPhotoOn(e.target.checked)} /> Show photo</label>
    </main>
  )
}
