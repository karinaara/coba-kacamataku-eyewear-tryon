import type { Placement } from '../core/fit'
import type { FrameBitmap } from '../frames/raster'

// Source slices overlap by this many bitmap pixels so no hairline shows between the three pieces.
const SEAM = 1.5

/**
 * Draws a frame onto a canvas in picture pixels. The bitmap is cut into three pieces: the frame
 * front, and the temple stubs on each side, so the temples can be squashed and faded on their own
 * when the head turns. The caller clears the canvas first.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, entry: FrameBitmap, p: Placement) {
  if (p.frontAlpha <= 0) return
  const { bitmap, frame } = entry
  const vb = frame.viewBox
  const fb = frame.frontBox
  const ratio = bitmap.width / vb.w // bitmap pixels per frame unit
  const leftEdge = (fb.x - vb.x) * ratio
  const rightEdge = (fb.x + fb.w - vb.x) * ratio
  const bh = bitmap.height

  ctx.save()
  ctx.translate(p.cx, p.cy)
  ctx.rotate(p.rotation)
  ctx.scale(p.scaleX, p.scaleY)

  // Frame front (full alpha unless the head is turned very far).
  ctx.globalAlpha = p.frontAlpha
  ctx.drawImage(bitmap, leftEdge - SEAM, 0, rightEdge - leftEdge + SEAM * 2, bh, fb.x - SEAM / ratio, vb.y, fb.w + (SEAM * 2) / ratio, vb.h)

  // Temples, squashed toward the hinge by cos(yaw) and faded per side.
  const leftW = fb.x - vb.x
  const rightW = vb.x + vb.w - (fb.x + fb.w)
  if (p.leftTempleAlpha > 0 && leftEdge > 0) {
    ctx.globalAlpha = p.frontAlpha * p.leftTempleAlpha
    ctx.drawImage(bitmap, 0, 0, leftEdge, bh, fb.x - leftW * p.templeScale, vb.y, leftW * p.templeScale + SEAM / ratio, vb.h)
  }
  if (p.rightTempleAlpha > 0 && rightEdge < bitmap.width) {
    ctx.globalAlpha = p.frontAlpha * p.rightTempleAlpha
    ctx.drawImage(bitmap, rightEdge, 0, bitmap.width - rightEdge, bh, fb.x + fb.w - SEAM / ratio, vb.y, rightW * p.templeScale + SEAM / ratio, vb.h)
  }
  ctx.restore()
}
