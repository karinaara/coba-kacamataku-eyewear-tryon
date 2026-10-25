import { useRef, useState } from 'react'
import { download } from '../camera/evalTools'
import { loadLandmarker } from '../camera/landmarker'
import { median } from '../eval/metrics'
import type { PerfEntry } from '../eval/fixtures'

const f = (v: number | undefined, d = 1) => (v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d))
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))] ?? NaN

async function startSource(kind: 'camera' | 'photo', photo: File | null, video: HTMLVideoElement): Promise<() => void> {
  if (kind === 'camera') {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    video.srcObject = stream
    await video.play()
    return () => stream.getTracks().forEach((t) => t.stop())
  }
  // A photo, drawn onto a canvas stream: a steady 30 fps source that does not need a camera.
  if (!photo) throw new Error('Choose a photo first')
  const bmp = await createImageBitmap(photo, { imageOrientation: 'from-image' })
  const c = document.createElement('canvas')
  c.width = 1280
  c.height = Math.round((bmp.height * 1280) / bmp.width)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas is not available')
  const draw = () => ctx.drawImage(bmp, 0, 0, c.width, c.height)
  draw()
  const timer = setInterval(draw, 33)
  const stream = c.captureStream(30)
  video.srcObject = stream
  await video.play()
  return () => {
    clearInterval(timer)
    stream.getTracks().forEach((t) => t.stop())
  }
}

/**
 * Developer tool (open with ?perf): measures cold load, model load and detection speed on THIS device,
 * and exports a JSON entry for fixtures/perf/. Run it on a laptop and on a low-end Android phone.
 */
export function PerfScreen({ onBack }: { onBack: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [device, setDevice] = useState('')
  const [kind, setKind] = useState<PerfEntry['kind']>('laptop')
  const [source, setSource] = useState<'camera' | 'photo'>('camera')
  const [photo, setPhoto] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [frames, setFrames] = useState(120)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [entry, setEntry] = useState<PerfEntry | null>(null)

  const run = async () => {
    const video = videoRef.current
    if (!video) return
    setRunning(true)
    setEntry(null)
    let stop = () => {}
    try {
      setStatus('Loading the face model (cold)...')
      const t0 = performance.now()
      const first = await loadLandmarker('VIDEO')
      const modelLoadMs = performance.now() - t0
      setStatus('Loading the face model again (warm)...')
      const t1 = performance.now()
      const second = await loadLandmarker('VIDEO')
      const modelLoadWarmMs = performance.now() - t1
      second.landmarker.close()

      setStatus(source === 'camera' ? 'Starting the camera...' : 'Starting the photo source...')
      stop = await startSource(source, photo, video)

      setStatus(`Measuring ${frames} detections...`)
      const times: number[] = []
      let lastTime = -1
      let firstDetectionMs = NaN
      const loopStart = performance.now()
      const deadline = loopStart + 30000
      while (times.length < frames && performance.now() < deadline) {
        if (video.readyState >= 2 && video.currentTime !== lastTime) {
          lastTime = video.currentTime
          const a = performance.now()
          const res = first.landmarker.detectForVideo(video, a)
          times.push(performance.now() - a)
          if (Number.isNaN(firstDetectionMs) && res.faceLandmarks.length > 0) firstDetectionMs = performance.now() - loopStart
        }
        await new Promise((r) => setTimeout(r, 0))
      }
      const elapsed = performance.now() - loopStart
      const nav = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')
      const med = median(times)
      first.landmarker.close()
      setEntry({
        device: device.trim() || 'unnamed device',
        kind,
        note: [source === 'photo' ? 'Measured on a steady 30 fps photo source (no camera).' : '', note.trim()].filter(Boolean).join(' ') || undefined,
        loadToLandingMs: nav ? nav.startTime : undefined,
        modelLoadMs,
        modelLoadWarmMs,
        firstDetectionMs,
        detectFrames: times.length,
        detectMsMedian: med,
        detectMsP95: p95(times),
        detectFps: (times.length / elapsed) * 1000,
        headroomFps: 1000 / med,
        delegate: first.delegate,
        userAgent: navigator.userAgent,
      })
      setStatus(null)
    } catch (e) {
      setStatus(`Could not finish: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      stop()
      if (video.srcObject) video.srcObject = null
      setRunning(false)
    }
  }

  const input = 'min-h-11 rounded-xl border border-ink/20 bg-white px-3 text-sm'
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-10 pt-4">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">Back</button>
        <h1 className="font-display text-base font-bold">Performance</h1>
        <span className="w-16" aria-hidden="true" />
      </header>
      <p className="rounded-2xl bg-white p-4 text-sm">
        Measures how long the face model takes to load and how fast it finds a face, on this device. Run it on a laptop and on a low-end Android phone, then save the file into <code>fixtures/perf/</code>. Nothing leaves the device.
      </p>

      <section className="flex flex-col gap-3 rounded-3xl bg-white p-4" aria-label="Setup">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Device (for example: Redmi 9A, Chrome 126)
          <input className={input} value={device} onChange={(e) => setDevice(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Kind
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value as PerfEntry['kind'])}>
            <option value="laptop">Laptop</option>
            <option value="phone">Phone</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="flex gap-2" role="radiogroup" aria-label="Video source">
          {(['camera', 'photo'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={source === s} onClick={() => setSource(s)} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${source === s ? 'bg-accent text-white' : 'bg-chip text-chip-ink'}`}>
              {s === 'camera' ? 'Use the camera' : 'Use a photo'}
            </button>
          ))}
        </div>
        {source === 'photo' && (
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Photo of a face
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Detections to measure
          <input className={input} type="number" min={20} max={600} value={frames} onChange={(e) => setFrames(Math.max(20, Number(e.target.value) || 120))} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Note (battery saver on, other apps open, ...)
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="button" onClick={() => void run()} disabled={running} className="min-h-12 rounded-2xl bg-accent px-6 text-base font-semibold text-white disabled:opacity-60">
          {running ? 'Measuring...' : 'Run measurement'}
        </button>
      </section>

      <video ref={videoRef} playsInline muted className="h-24 w-24 rounded-xl bg-ink object-cover" aria-hidden="true" />
      {status && <p role="status" className="rounded-2xl bg-white p-3 text-sm">{status}</p>}

      {entry && (
        <section className="rounded-3xl bg-white p-4" aria-labelledby="perf-heading" id="perf-result">
          <h2 id="perf-heading" className="font-display text-lg font-bold">Result: {entry.device}</h2>
          <table className="mt-2 w-full text-left text-sm">
            <tbody>
              {(
                [
                  ['Time to first paint', entry.loadToLandingMs !== undefined ? `${f(entry.loadToLandingMs, 0)} ms` : 'n/a'],
                  ['Model load, cold', `${f(entry.modelLoadMs, 0)} ms`],
                  ['Model load, warm', `${f(entry.modelLoadWarmMs, 0)} ms`],
                  ['First face found', `${f(entry.firstDetectionMs, 0)} ms after start`],
                  ['Detection time, median', `${f(entry.detectMsMedian)} ms`],
                  ['Detection time, slowest 5%', `${f(entry.detectMsP95)} ms`],
                  ['Detections per second (measured)', f(entry.detectFps)],
                  ['Detections per second (headroom)', f(entry.headroomFps, 0)],
                  ['Delegate', entry.delegate ?? 'n/a'],
                ] as [string, string][]
              ).map(([k, v]) => (
                <tr key={k} className="border-t border-ground">
                  <th scope="row" className="py-1 pr-2 font-normal text-muted">{k}</th>
                  <td className="py-1 text-right font-semibold tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">The measured rate is capped by the video source (30 per second here). Headroom is 1000 divided by the median detection time: what detection alone could manage.</p>
          <button type="button" onClick={() => download(`${entry.kind}-${entry.device.replace(/[^a-zA-Z0-9]+/g, '-')}.json`, JSON.stringify(entry, null, 2))} className="mt-3 min-h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-white">
            Save result JSON
          </button>
        </section>
      )}
    </main>
  )
}
