// Image variants for the robustness check: the same photo, changed in ways a real camera or user would.
// Browser only (canvas).

import type { VariantGroup } from '../eval/robustness'

export interface Variant {
  name: string
  group: VariantGroup
  make: () => Promise<File>
}

const BASE_WIDTH = 1280
const GRAY = '#808080'

function toFile(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<File> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], 'variant', { type })) : reject(new Error('Could not encode the variant'))), type, quality),
  )
}

function canvasOf(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.round(w)
  c.height = Math.round(h)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas is not available')
  draw(ctx)
  return c
}

/** Builds the variants for one photo. Nothing is kept: each variant is made on demand and discarded. */
export async function makeVariants(file: File): Promise<Variant[]> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const w = Math.min(BASE_WIDTH, bitmap.width)
  const h = Math.round((bitmap.height * w) / bitmap.width)

  const png = (g: VariantGroup, name: string, cw: number, ch: number, draw: (ctx: CanvasRenderingContext2D) => void): Variant => ({
    group: g,
    name,
    make: () => toFile(canvasOf(cw, ch, draw), 'image/png'),
  })
  const full = (ctx: CanvasRenderingContext2D) => ctx.drawImage(bitmap, 0, 0, w, h)

  const variants: Variant[] = [png('original', 'original', w, h, full)]

  for (const s of [0.5, 0.75, 1.25]) variants.push(png('scale', `size x${s}`, w * s, h * s, (ctx) => ctx.drawImage(bitmap, 0, 0, w * s, h * s)))

  for (const b of [0.7, 1.3])
    variants.push(
      png('light', `brightness x${b}`, w, h, (ctx) => {
        ctx.filter = `brightness(${b})`
        full(ctx)
      }),
    )

  for (const q of [0.5, 0.25, 0.1]) {
    variants.push({ group: 'compression', name: `JPEG quality ${q}`, make: () => toFile(canvasOf(w, h, full), 'image/jpeg', q) })
  }

  for (const deg of [-6, -3, 3, 6]) {
    variants.push(
      png('rotation', `rotated ${deg > 0 ? '+' : ''}${deg} deg`, w, h, (ctx) => {
        ctx.fillStyle = GRAY
        ctx.fillRect(0, 0, w, h)
        ctx.translate(w / 2, h / 2)
        ctx.rotate((deg * Math.PI) / 180)
        ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
      }),
    )
  }

  for (const c of [0.05, 0.1]) {
    const cw = w * (1 - 2 * c)
    const ch = h * (1 - 2 * c)
    variants.push(png('crop', `cropped ${c * 100}% each side`, cw, ch, (ctx) => ctx.drawImage(bitmap, bitmap.width * c, bitmap.height * c, bitmap.width * (1 - 2 * c), bitmap.height * (1 - 2 * c), 0, 0, cw, ch)))
  }

  for (const [name, dx, dy] of [['shifted 3% right', 0.03, 0], ['shifted 3% up', 0, -0.03]] as const) {
    variants.push(
      png('shift', name, w, h, (ctx) => {
        ctx.fillStyle = GRAY
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(bitmap, dx * w, dy * h, w, h)
      }),
    )
  }
  return variants
}
