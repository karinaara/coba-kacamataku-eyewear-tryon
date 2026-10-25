import { DEBUG_OVERLAY as C } from '../core/config/debugOverlay'
import { KEY_INDICES, LM_NAME_BY_INDEX, lmAt, type Point3 } from '../core/landmarks'
import { MEASURE_LINES } from '../core/measure'
import { roiHull, type RoiName } from '../core/roi'

export type IndexMode = 'off' | 'key' | 'near' | 'all'

export interface OverlayOptions {
  showDots: boolean
  indexMode: IndexMode
  /** Pointer position in canvas CSS pixels, for 'near' mode. */
  pointer: { x: number; y: number } | null
  /** The video is shown mirrored (selfie view); landmarks are mirrored to match, text is not. */
  mirror: boolean
  /** Outline the skin sampling regions (cheeks, forehead). */
  rois?: boolean
  /** Hide the dots and key points, leaving only what else is enabled. */
  hideDots?: boolean
}

const ROI_COLORS = { rightCheek: '#38bdf8', leftCheek: '#38bdf8', forehead: '#f472b6' } as const

const KEY_SET = new Set(KEY_INDICES)

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number) {
  ctx.font = `600 ${px}px Inter Variable, Inter, sans-serif`
  ctx.lineWidth = 3
  ctx.strokeStyle = C.labelStroke
  ctx.strokeText(text, x, y)
  ctx.fillStyle = C.labelColor
  ctx.fillText(text, x, y)
}

/**
 * Draws the first `count` measurement lines (face length, forehead, cheekbones, jaw) with end caps.
 * The line at index `count - 1` is drawn brighter, as the one being "measured" right now.
 */
export function drawMeasureLines(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Point3[],
  cssW: number,
  cssH: number,
  mirror: boolean,
  count: number,
) {
  ctx.clearRect(0, 0, cssW, cssH)
  const X = (p: Point3) => (mirror ? 1 - p.x : p.x) * cssW
  const Y = (p: Point3) => p.y * cssH
  MEASURE_LINES.slice(0, count).forEach((line, i) => {
    const a = lmAt(landmarks, line.a)
    const b = lmAt(landmarks, line.b)
    const current = i === count - 1
    ctx.lineCap = 'round'
    ctx.lineWidth = current ? 4 : 2.5
    ctx.strokeStyle = current ? '#5eead4' : 'rgba(255,255,255,0.85)'
    ctx.beginPath()
    ctx.moveTo(X(a), Y(a))
    ctx.lineTo(X(b), Y(b))
    ctx.stroke()
    ctx.fillStyle = ctx.strokeStyle
    for (const p of [a, b]) {
      ctx.beginPath()
      ctx.arc(X(p), Y(p), current ? 6 : 4, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Point3[] | null,
  cssW: number,
  cssH: number,
  opts: OverlayOptions,
) {
  ctx.clearRect(0, 0, cssW, cssH)
  if (!landmarks) return

  const px = (p: Point3) => (opts.mirror ? 1 - p.x : p.x) * cssW
  const py = (p: Point3) => p.y * cssH
  ctx.textBaseline = 'middle'

  if (opts.rois) {
    ctx.lineWidth = 2
    for (const name of Object.keys(ROI_COLORS) as RoiName[]) {
      const hull = roiHull(landmarks, name)
      if (hull.length < 3) continue
      ctx.strokeStyle = ROI_COLORS[name]
      ctx.beginPath()
      hull.forEach(([x, y], i) => {
        const X = (opts.mirror ? 1 - x : x) * cssW
        if (i === 0) ctx.moveTo(X, y * cssH)
        else ctx.lineTo(X, y * cssH)
      })
      ctx.closePath()
      ctx.stroke()
    }
  }
  if (opts.hideDots) return

  if (opts.showDots) {
    ctx.fillStyle = C.dotColor
    ctx.beginPath()
    landmarks.forEach((p, i) => {
      if (KEY_SET.has(i)) return
      const x = px(p)
      const y = py(p)
      ctx.moveTo(x + C.dotRadius, y)
      ctx.arc(x, y, C.dotRadius, 0, Math.PI * 2)
    })
    ctx.fill()
  }

  landmarks.forEach((p, i) => {
    const isKey = KEY_SET.has(i)
    const x = px(p)
    const y = py(p)

    if (isKey) {
      ctx.fillStyle = C.keyDotColor
      ctx.beginPath()
      ctx.arc(x, y, C.keyDotRadius, 0, Math.PI * 2)
      ctx.fill()
    }

    let text: string | null = null
    let size = C.labelFontPx
    if (opts.indexMode === 'all') {
      text = String(i)
      if (isKey) size = C.keyLabelFontPx
    } else if (opts.indexMode === 'key' && isKey) {
      text = `${i} ${LM_NAME_BY_INDEX.get(i) ?? ''}`.trim()
      size = C.keyLabelFontPx
    } else if (opts.indexMode === 'near' && opts.pointer) {
      if (Math.hypot(x - opts.pointer.x, y - opts.pointer.y) <= C.nearPointerPx) {
        text = String(i)
        size = isKey ? C.keyLabelFontPx : C.labelFontPx + 1
      }
    }
    if (text) label(ctx, text, x + 5, y, size)
  })
}
