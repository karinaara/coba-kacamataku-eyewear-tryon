import { useEffect, useRef, useState } from 'react'
import { FRAME_COLORS } from '../core/config/colors'
import { FRAME_STYLES, LENS_TINTS, SIZES, type LensTintId, type SizeId } from '../core/config/frames'
import { catalogSize, enumerateFrames, enumerateVisuals, renderSpec, uniqueVisualCount, visualKey, type FrameSpec } from '../frames/catalog'
import { cacheStats, getFrame, peekFrame } from '../frames/raster'

type View = 'styles' | 'colors'

function Thumb({ spec, label, sub }: { spec: FrameSpec; label: string; sub: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLLIElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    let cancelled = false
    const draw = () => {
      getFrame(spec)
        .then(({ bitmap }) => {
          const canvas = canvasRef.current
          const ctx = canvas?.getContext('2d')
          if (cancelled || !canvas || !ctx) return
          const w = canvas.clientWidth * (window.devicePixelRatio || 1)
          const h = (w * bitmap.height) / bitmap.width
          canvas.width = w
          canvas.height = h
          ctx.drawImage(bitmap, 0, 0, w, h)
        })
        .catch(() => !cancelled && setFailed(true))
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect()
        draw()
      }
    }, { rootMargin: '200px' })
    io.observe(box)
    return () => {
      cancelled = true
      io.disconnect()
    }
  }, [spec])

  return (
    <li ref={boxRef} className="rounded-2xl bg-white p-3">
      <div className="grid aspect-[5/2] place-items-center rounded-xl bg-accent-tint/60">
        {failed ? <span className="text-xs text-warn">Could not draw</span> : <canvas ref={canvasRef} className="h-auto w-full" role="img" aria-label={`${label}, ${sub}`} />}
      </div>
      <p className="mt-2 text-sm font-semibold">{label}</p>
      <p className="text-xs text-muted">{sub}</p>
    </li>
  )
}

interface VerifyReport {
  specs: number
  visuals: number
  decoded: number
  failed: string[]
  generateMs: number
  rasterMsAvg: number
  totalSec: number
  cachedDrawMs: number
  cacheHitMs: number
  cache: { size: number; limit: number }
}

async function verifyAll(onProgress: (done: number, total: number) => void): Promise<VerifyReport> {
  const t0 = performance.now()
  // 1. Every combination (including all sizes) generates.
  let specs = 0
  const g0 = performance.now()
  for (const s of enumerateFrames()) {
    renderSpec(s)
    specs++
  }
  const generateMs = (performance.now() - g0) / specs

  // 2. Every distinct picture decodes in the browser as a real SVG image.
  const visuals = [...enumerateVisuals()]
  const failed: string[] = []
  let decoded = 0
  let rasterTotal = 0
  const queue = [...visuals]
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const t = performance.now()
      try {
        await getFrame(s)
        decoded++
      } catch {
        failed.push(visualKey(s))
      }
      rasterTotal += performance.now() - t
      onProgress(decoded + failed.length, visuals.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))

  // 3. Cached drawing cost: draw bitmaps that are already in the cache onto a face-sized canvas.
  const bench = document.createElement('canvas')
  bench.width = 480
  bench.height = 200
  const ctx = bench.getContext('2d')
  const cached = visuals.slice(-32)
  await Promise.all(cached.map((s) => getFrame(s)))
  let draws = 0
  let hitTotal = 0
  const d0 = performance.now()
  for (let round = 0; round < 20; round++) {
    for (const s of cached) {
      const h0 = performance.now()
      const hit = peekFrame(s)
      hitTotal += performance.now() - h0
      if (hit && ctx) {
        ctx.clearRect(0, 0, 480, 200)
        ctx.drawImage(hit.bitmap, 0, 0, 480, (480 * hit.bitmap.height) / hit.bitmap.width)
        draws++
      }
    }
  }
  const cachedDrawMs = (performance.now() - d0) / Math.max(1, draws)

  return {
    specs,
    visuals: visuals.length,
    decoded,
    failed,
    generateMs,
    rasterMsAvg: rasterTotal / visuals.length,
    totalSec: (performance.now() - t0) / 1000,
    cachedDrawMs,
    cacheHitMs: hitTotal / Math.max(1, draws),
    cache: cacheStats(),
  }
}

export function GalleryScreen({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<View>('styles')
  const [styleId, setStyleId] = useState(FRAME_STYLES[0]!.id)
  const [colorId, setColorId] = useState('jet-black')
  const [tint, setTint] = useState<LensTintId>('clear')
  const [size, setSize] = useState<SizeId>('M')
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [report, setReport] = useState<VerifyReport | null>(null)

  const cards =
    view === 'styles'
      ? FRAME_STYLES.map((s) => ({ spec: { styleId: s.id, colorId, tint, size }, label: s.name, sub: `${s.family}, ${s.builds.join(' / ')}` }))
      : FRAME_COLORS.map((c) => ({ spec: { styleId, colorId: c.id, tint, size }, label: c.name, sub: `${c.material}, ${c.temperature}` }))

  const run = async () => {
    setReport(null)
    setProgress([0, uniqueVisualCount()])
    setReport(await verifyAll((d, t) => setProgress([d, t])))
    setProgress(null)
  }

  const select = 'min-h-11 rounded-xl border border-ink/20 bg-white px-3 text-sm'
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-5 pb-10 pt-4">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">
          Back
        </button>
        <h1 className="font-display text-base font-bold">Frame gallery</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <p className="text-sm text-muted">
        {FRAME_STYLES.length} styles x {FRAME_COLORS.length} colors x {SIZES.length} sizes x {LENS_TINTS.length} lens tints = {catalogSize().toLocaleString()} frames,
        all drawn in code. {uniqueVisualCount().toLocaleString()} distinct pictures (sizes change the fit, not the drawing).
      </p>

      <section className="flex flex-wrap items-end gap-3 rounded-3xl bg-white p-4" aria-label="Gallery controls">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Show
          <select className={select} value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="styles">All styles in one color</option>
            <option value="colors">All colors on one style</option>
          </select>
        </label>
        {view === 'styles' ? (
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Color
            <select className={select} value={colorId} onChange={(e) => setColorId(e.target.value)}>
              {FRAME_COLORS.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Style
            <select className={select} value={styleId} onChange={(e) => setStyleId(e.target.value)}>
              {FRAME_STYLES.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Lens
          <select className={select} value={tint} onChange={(e) => setTint(e.target.value as LensTintId)}>
            {LENS_TINTS.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Size
          <select className={select} value={size} onChange={(e) => setSize(e.target.value as SizeId)}>
            {SIZES.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.fitFactor})</option>
            ))}
          </select>
        </label>
      </section>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Frames">
        {cards.map((c) => (
          <Thumb key={visualKey(c.spec)} spec={c.spec} label={c.label} sub={c.sub} />
        ))}
      </ul>

      <section className="rounded-3xl bg-white p-4" aria-labelledby="verify-heading">
        <h2 id="verify-heading" className="font-display text-lg font-bold">Verify everything</h2>
        <p className="mt-1 text-sm text-muted">
          Generates all {catalogSize().toLocaleString()} frames, decodes every distinct picture as a real image in this browser, then times cached drawing.
        </p>
        <button type="button" onClick={() => void run()} disabled={progress !== null} className="mt-3 min-h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60">
          {progress ? `Decoding ${progress[0]} / ${progress[1]}...` : 'Run verification'}
        </button>
        {report && (
          <dl id="verify-report" className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" aria-live="polite">
            <dt>Frames generated</dt><dd className="font-semibold">{report.specs.toLocaleString()}</dd>
            <dt>Distinct pictures decoded</dt><dd className="font-semibold">{report.decoded.toLocaleString()} / {report.visuals.toLocaleString()}</dd>
            <dt>Failed</dt><dd className="font-semibold">{report.failed.length}{report.failed.length ? ` (${report.failed.slice(0, 3).join('; ')})` : ''}</dd>
            <dt>Generate one SVG (average)</dt><dd className="font-semibold">{report.generateMs.toFixed(3)} ms</dd>
            <dt>Decode + rasterize (average, 6 at a time)</dt><dd className="font-semibold">{report.rasterMsAvg.toFixed(1)} ms</dd>
            <dt>Cache lookup, cached frame</dt><dd className="font-semibold">{report.cacheHitMs.toFixed(4)} ms</dd>
            <dt>Cached frame drawn to canvas</dt><dd className="font-semibold">{report.cachedDrawMs.toFixed(3)} ms</dd>
            <dt>Bitmaps kept in memory</dt><dd className="font-semibold">{report.cache.size} / {report.cache.limit}</dd>
            <dt>Total time</dt><dd className="font-semibold">{report.totalSec.toFixed(1)} s</dd>
          </dl>
        )}
      </section>
    </main>
  )
}
