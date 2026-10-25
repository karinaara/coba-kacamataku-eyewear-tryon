import { useRef, useState } from 'react'
import { analyzeFile, download, fixtureJson, runVariants, safeId, toFixture, type Analyzed } from '../camera/evalTools'
import { makeVariants } from '../camera/perturb'
import { ROBUST_FEATURES, summarizeRobustness, type RobustnessSummary, type VariantRow } from '../eval/robustness'

interface Item {
  key: number
  file: File
  id: string
  meta: { person?: string; condition?: string; capture?: number }
  analyzed: Analyzed | null
  error: string | null
}

const f = (v: number | undefined, d = 2) => (v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d))
const pct = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? 'n/a' : `${Math.round(v * 100)}%`)

/**
 * Developer tool (open with ?collect). Turns photos into evaluation fixtures on this device:
 * landmarks and a color summary, never the picture. Also runs a robustness check on one photo.
 */
export function EvalCollectScreen({ onBack }: { onBack: () => void }) {
  const [person, setPerson] = useState('')
  const [condition, setCondition] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [robust, setRobust] = useState<{ file: string; rows: VariantRow[]; summary: RobustnessSummary } | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const counter = useRef(0)

  const add = async (files: FileList) => {
    setBusy(true)
    const next: Item[] = []
    for (const file of Array.from(files)) {
      const n = ++counter.current
      const p = person.trim()
      const c = condition.trim()
      const id = p && c ? safeId(`${p}-${c}`) : p ? safeId(`${p}-${String(n).padStart(2, '0')}`) : safeId(file.name)
      const meta = { person: p || undefined, condition: c || undefined, capture: p && !c ? n : undefined }
      try {
        next.push({ key: n, file, id, meta, analyzed: await analyzeFile(file), error: null })
      } catch (e) {
        next.push({ key: n, file, id, meta, analyzed: null, error: e instanceof Error ? e.message : 'could not read this photo' })
      }
      setItems((cur) => [...cur.filter((x) => x.key !== n), ...next.filter((x) => x.key === n)])
    }
    setBusy(false)
  }

  const save = (it: Item) => it.analyzed && download(`${it.id}.json`, fixtureJson(toFixture(it.analyzed, it.id, it.meta)))
  const saveAll = async () => {
    for (const it of items) {
      save(it)
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  const runRobust = async (it: Item) => {
    setRobust(null)
    setProgress('Preparing variants...')
    const variants = await makeVariants(it.file)
    const rows = await runVariants(variants, (d, t) => setProgress(`Analyzing variant ${d} of ${t}...`))
    setProgress(null)
    setRobust({ file: it.id, rows, summary: summarizeRobustness(rows) })
  }

  const input = 'min-h-11 rounded-xl border border-ink/20 bg-white px-3 text-sm'
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-5 pb-10 pt-4">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">Back</button>
        <h1 className="font-display text-base font-bold">Evaluation fixtures</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <p className="rounded-2xl bg-white p-4 text-sm">
        Turns photos into fixtures for <code>npm run eval</code>, here on this device. A fixture holds <b>landmarks and a color summary only, never the photo</b>. Landmarks still describe a face, so only use photos of people who agreed, and do not publish the files. See <code>docs/eval/PROTOCOL.md</code>.
      </p>

      <section className="flex flex-wrap items-end gap-3 rounded-3xl bg-white p-4" aria-label="Naming">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Person (a code such as p01, not a name)
          <input className={input} value={person} onChange={(e) => setPerson(e.target.value)} placeholder="optional" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Lighting condition (color test)
          <input className={input} value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="daylight, indoor-warm, indoor-cool" list="conds" />
          <datalist id="conds">
            <option value="daylight" />
            <option value="indoor-warm" />
            <option value="indoor-cool" />
          </datalist>
        </label>
        <p className="basis-full text-xs text-muted">
          Face shape set: leave both empty (the file name becomes the id). Stability set: fill Person only (captures are numbered). Color set: fill both.
        </p>
        <label className="min-h-11 cursor-pointer rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white">
          {busy ? 'Reading...' : 'Choose photos'}
          <input type="file" multiple accept="image/*" className="sr-only" disabled={busy} onChange={(e) => e.target.files && void add(e.target.files)} />
        </label>
      </section>

      {items.length > 0 && (
        <section className="rounded-3xl bg-white p-4" aria-label="Photos read">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 pr-2 font-normal">Id</th>
                  <th className="py-1 pr-2 font-normal">Shape</th>
                  <th className="py-1 pr-2 font-normal">L/W</th>
                  <th className="py-1 pr-2 font-normal">F/C</th>
                  <th className="py-1 pr-2 font-normal">J/C</th>
                  <th className="py-1 pr-2 font-normal">Skin</th>
                  <th className="py-1 font-normal" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.key} className="border-t border-ground align-top">
                    <td className="py-1 pr-2 font-semibold">{it.id}</td>
                    {it.analyzed ? (
                      <>
                        <td className="py-1 pr-2">{it.analyzed.analysis.shape.primary} {pct(it.analyzed.analysis.shape.probabilities[it.analyzed.analysis.shape.primary])}</td>
                        <td className="py-1 pr-2 tabular-nums">{f(it.analyzed.analysis.measurements.lengthToWidth)}</td>
                        <td className="py-1 pr-2 tabular-nums">{f(it.analyzed.analysis.measurements.foreheadToCheek)}</td>
                        <td className="py-1 pr-2 tabular-nums">{f(it.analyzed.analysis.measurements.jawToCheek)}</td>
                        <td className="py-1 pr-2">{it.analyzed.profile ? `${it.analyzed.profile.depth}, ${it.analyzed.profile.undertone}, ${pct(it.analyzed.profile.confidence)}` : 'not read'}</td>
                        <td className="flex gap-1 py-1">
                          <button type="button" onClick={() => save(it)} className="min-h-11 rounded-xl bg-chip px-3 font-semibold text-chip-ink">Save</button>
                          <button type="button" onClick={() => void runRobust(it)} disabled={progress !== null} className="min-h-11 rounded-xl bg-chip px-3 font-semibold text-chip-ink disabled:opacity-50">Robustness</button>
                        </td>
                      </>
                    ) : (
                      <td className="py-1 text-warn" colSpan={6}>{it.error}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => void saveAll()} className="mt-3 min-h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-white">
            Save all fixtures
          </button>
          <p className="mt-1 text-xs text-muted">Your browser may ask to allow several downloads. Put the files in the matching <code>fixtures/</code> folder.</p>
        </section>
      )}

      {progress && <p role="status" className="rounded-2xl bg-white p-3 text-sm">{progress}</p>}

      {robust && (
        <section className="rounded-3xl bg-white p-4" aria-labelledby="robust-heading" id="robust-report">
          <h2 id="robust-heading" className="font-display text-lg font-bold">Robustness check: {robust.file}</h2>
          <p className="mt-1 text-xs text-muted">
            One photo, changed 16 ways (resized, re-lit, recompressed, rotated, cropped, shifted). This shows how much the pipeline moves for the same face. It is <b>not</b> the stability test, which needs repeated captures of a real person.
          </p>
          <p className="mt-2 text-sm">
            {robust.summary.withFace} of {robust.summary.variants} variants found a face. Primary shape changed in {pct(robust.summary.shapeFlipRate)} of them ({Object.entries(robust.summary.shapes).map(([k, n]) => `${k} ${n}`).join(', ')}); undertone changed in {pct(robust.summary.undertoneFlipRate)}; depth in {pct(robust.summary.depthFlipRate)}.
          </p>
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="text-muted"><th className="py-1 font-normal">Measure</th><th className="py-1 font-normal">Mean</th><th className="py-1 font-normal">Std</th><th className="py-1 font-normal">CV</th><th className="py-1 font-normal">Range</th></tr>
            </thead>
            <tbody>
              {ROBUST_FEATURES.map((k) => {
                const s = robust.summary.features[k]
                return (
                  <tr key={k} className="border-t border-ground">
                    <th scope="row" className="py-1 pr-2 font-normal">{k}</th>
                    <td className="py-1 tabular-nums">{f(s.mean)}</td>
                    <td className="py-1 tabular-nums">{f(s.std, 3)}</td>
                    <td className="py-1 tabular-nums">{pct(s.cv)}</td>
                    <td className="py-1 tabular-nums">{f(s.min)} to {f(s.max)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs">
            Mean change in length/width from the original, by kind of change: {Object.entries(robust.summary.lengthToWidthShiftByGroup).map(([g, v]) => `${g} ${f(v, 3)}`).join(', ')}.
          </p>
          {robust.summary.changed.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {robust.summary.changed.map((c) => (
                <li key={c.name}>
                  <b>{c.name}</b>: {c.what.join('; ')}
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => download(`robustness-${robust.file}.json`, JSON.stringify({ file: robust.file, summary: robust.summary, rows: robust.rows }, null, 2))} className="mt-3 min-h-11 rounded-2xl bg-chip px-5 text-sm font-semibold text-chip-ink">
            Save robustness JSON
          </button>
          <details className="mt-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Every variant</summary>
            <table className="mt-2 w-full text-left text-xs">
              <tbody>
                {robust.rows.map((r) => (
                  <tr key={r.name} className="border-t border-ground">
                    <th scope="row" className="py-1 pr-2 font-normal">{r.name}</th>
                    {r.ok ? <td className="py-1 tabular-nums">L/W {f(r.lengthToWidth)}, F/C {f(r.foreheadToCheek)}, J/C {f(r.jawToCheek)}; {r.primary}; {r.depth}, {r.undertone}, {pct(r.confidence)}</td> : <td className="py-1 text-warn">no face found</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}
    </main>
  )
}
