import { useEffect, useState, type RefObject } from 'react'
import type { FrameSpec } from '../frames/catalog'
import type { Drawer3D } from '../frames3d/drawerTypes'

export type Drawer3DState = { drawer: Drawer3D | null; failed: string | null }

/**
 * Loads the 3D library the first time it is needed and makes a drawer for `canvasRef`.
 * `failed` is set if WebGL is not available or the library could not load, so the caller can fall back to 2D.
 * The canvas must be one that was never given a 2D context (give it a `key` that changes with the mode).
 */
export function useDrawer3D(canvasRef: RefObject<HTMLCanvasElement | null>, enabled: boolean, spec: FrameSpec | null, showOccluders = false): Drawer3DState {
  const [state, setState] = useState<Drawer3DState>({ drawer: null, failed: null })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!enabled || !canvas) return
    let cancelled = false
    let made: Drawer3D | null = null
    import('../frames3d/drawer')
      .then(({ Frame3DDrawer }) => {
        if (cancelled) return
        made = new Frame3DDrawer(canvas, { showOccluders })
        setState({ drawer: made, failed: null })
      })
      .catch((e: unknown) => {
        console.error(e)
        if (!cancelled) setState({ drawer: null, failed: e instanceof Error ? e.message : '3D is not available' })
      })
    return () => {
      cancelled = true
      made?.dispose()
      setState({ drawer: null, failed: null })
    }
  }, [canvasRef, enabled, showOccluders])

  const { drawer } = state
  const key = spec ? `${spec.styleId}|${spec.colorId}|${spec.tint}` : ''
  useEffect(() => {
    if (drawer && spec) drawer.setSpec(spec)
    // `spec` is covered by `key`: size does not change the model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawer, key])

  return state
}
