// `npm run eval`: reads fixtures/ and writes docs/eval/report.md and report.json.
//
//   fixtures/faceshape/*.json + labels.csv     face shape against labelers
//   fixtures/stability/<person>/*.json         repeated captures of one person
//   fixtures/color/<person>/<condition>.json   one capture per lighting condition (with a color summary)
//   fixtures/ratings/*.csv                     exports from the rating study (?study)
//   fixtures/perf/*.json                       exports from the performance page (?perf)
//
// Fixtures hold landmarks only, never photos. A file that cannot be read stops the run with its path:
// a silently skipped file would quietly change the numbers.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { EVAL } from '../../src/core/config/eval'
import { buildReport, type EvalInputs } from '../../src/eval/evaluate'
import { parseFixture, parseLabels, parsePerf, parseRatings, type EvalFixture } from '../../src/eval/fixtures'
import { renderReport } from '../../src/eval/report'
import { tune, type TuneItem } from '../../src/eval/tune'
import { majorityVote } from '../../src/eval/metrics'
import type { FaceShape } from '../../src/core/config/faceShapes'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : fallback
}
const ROOT = resolve(opt('fixtures', 'fixtures'))
const OUT = resolve(opt('out', join('docs', 'eval')))

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory()
const files = (dir: string, ext: string) => (isDir(dir) ? readdirSync(dir).filter((f) => extname(f).toLowerCase() === ext).sort().map((f) => join(dir, f)) : [])
const subdirs = (dir: string) => (isDir(dir) ? readdirSync(dir).filter((d) => isDir(join(dir, d))).sort() : [])

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''))
  } catch (e) {
    throw new Error(`${path}: not valid JSON (${e instanceof Error ? e.message : e})`)
  }
}
const fixture = (path: string): EvalFixture => parseFixture(readJson(path), path)

export function loadInputs(root: string): EvalInputs {
  const shapeDir = join(root, 'faceshape')
  const labelsPath = join(shapeDir, 'labels.csv')
  const stability: EvalInputs['stability'] = {}
  for (const person of subdirs(join(root, 'stability'))) stability[person] = files(join(root, 'stability', person), '.json').map(fixture)
  const color: EvalInputs['color'] = {}
  for (const person of subdirs(join(root, 'color'))) {
    color[person] = {}
    for (const file of files(join(root, 'color', person), '.json')) {
      const f = fixture(file)
      color[person]![f.meta?.condition ?? basename(file, '.json')] = f
    }
  }
  return {
    shape: {
      fixtures: files(shapeDir, '.json').map(fixture),
      labels: existsSync(labelsPath) ? parseLabels(readFileSync(labelsPath, 'utf8')) : [],
    },
    stability,
    color,
    ratings: files(join(root, 'ratings'), '.csv').flatMap((p) => parseRatings(readFileSync(p, 'utf8'))),
    perf: files(join(root, 'perf'), '.json').map((p) => parsePerf(readJson(p), p)),
  }
}

/** Faces with a labeler majority, in the form the tuner wants. */
function tuneItems(inputs: EvalInputs): TuneItem[] {
  const byId = new Map(inputs.shape.fixtures.map((f) => [f.id, f]))
  return inputs.shape.labels.flatMap((l) => {
    const f = byId.get(l.id)
    const label = majorityVote(l.votes).label as FaceShape | null
    return f && label ? [{ landmarks: f.landmarks, size: f.size, pose: f.pose, label }] : []
  })
}

function main() {
  const inputs = loadInputs(ROOT)
  const report = buildReport(inputs)
  const items = tuneItems(inputs)
  const tuned = items.length ? tune(items) : null
  const when = new Date().toISOString().slice(0, 10)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'report.md'), renderReport(report, tuned, when), 'utf8')
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ generated: when, report, tuning: tuned }, null, 2), 'utf8')

  const line = (name: string, s: { status: string; message: string }) => console.log(`${name.padEnd(12)} ${s.status.padEnd(12)} ${s.message}`)
  console.log(`Evaluation written to ${OUT}`)
  line('face shape', report.shape)
  line('stability', report.stability)
  line('color', report.color)
  line('ratings', report.ratings)
  line('performance', report.perf)
  console.log(`tuning       ${tuned ? tuned.reason : 'no labeled faces'}`)
  console.log(`(minimums: ${EVAL.minShapeItems} labeled faces, ${EVAL.minCaptures} captures, ${EVAL.minConditions} lighting conditions, ${EVAL.minParticipants} raters)`)
}

try {
  main()
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
