import { describe, expect, it } from 'vitest'
import { parseCsv, parseFixture, parseLabels, parsePerf, parseRatings } from './fixtures'
import { rawFixtureJson } from './testing'

describe('parseFixture', () => {
  it('accepts a real fixture, with landmarks as triples', () => {
    const f = parseFixture(rawFixtureJson(), 'test1.json')
    expect(f.id).toBe('test1')
    expect(f.landmarks).toHaveLength(478)
    expect(f.landmarks[0]).toHaveProperty('x')
    expect(f.pose?.yaw).toBeCloseTo(-1.91, 1)
  })

  it('reads optional color and meta', () => {
    const color = { skinLab: [56, 14, 16], hueDeg: 47.5, undertone: 'cool', warmth: 0.23, depth: 'tan', confidence: 0.94, confidenceLevel: 'High' }
    const f = parseFixture({ ...rawFixtureJson(), color, meta: { person: 'p01', condition: 'daylight' } })
    expect(f.color?.undertone).toBe('cool')
    expect(f.meta).toEqual({ person: 'p01', condition: 'daylight' })
  })

  it('says exactly what is wrong, with where', () => {
    const ok = rawFixtureJson()
    expect(() => parseFixture(null, 'a.json')).toThrow('a.json: not a JSON object')
    expect(() => parseFixture({ ...ok, id: '' }, 'a.json')).toThrow('a.json: missing "id"')
    expect(() => parseFixture({ ...ok, size: { width: 0, height: 10 } }, 'a.json')).toThrow(/size/)
    expect(() => parseFixture({ ...ok, landmarks: ok.landmarks.slice(0, 100) }, 'a.json')).toThrow(/landmarks/)
    expect(() => parseFixture({ ...ok, landmarks: [...ok.landmarks.slice(0, 477), [0, 'x', 0]] }, 'a.json')).toThrow(/landmark 477/)
    expect(() => parseFixture({ ...ok, pose: { yaw: 1 } }, 'a.json')).toThrow(/pose/)
    expect(() => parseFixture({ ...ok, color: { skinLab: [1, 2] } }, 'a.json')).toThrow(/color/)
  })
})

describe('CSV parsing', () => {
  it('skips blanks, comments and a byte-order mark, and trims', () => {
    expect(parseCsv('﻿id, a ,b\r\n\r\n# note\n x,1 , 2 \n')).toEqual([['id', 'a', 'b'], ['x', '1', '2']])
  })

  it('labels: header optional, case folded, a skipped labeler dropped', () => {
    const rows = parseLabels('id,labeler1,labeler2,labeler3\np01,Oval,oval,ROUND\np02,heart,,heart\n')
    expect(rows).toEqual([{ id: 'p01', votes: ['oval', 'oval', 'round'] }, { id: 'p02', votes: ['heart', 'heart'] }])
    expect(parseLabels('p01,oval,oval,oval')).toHaveLength(1)
  })

  it('labels: rejects a shape name that is not one of the six, and says which row', () => {
    expect(() => parseLabels('id,l1\np07,ovall')).toThrow(/row 1 \(p07\): "ovall"/)
    expect(() => parseLabels('id,l1\n,oval')).toThrow(/missing id/)
  })

  it('ratings: parses the study export and rejects bad arms or ratings', () => {
    const good = 'participant,trial,style,color,size,arm,rank,rating\np01,1,wayfarer,gold,M,top,2,4\np01,2,round,navy,S,random,12,2'
    expect(parseRatings(good)).toEqual([
      { participant: 'p01', trial: 1, style: 'wayfarer', color: 'gold', size: 'M', arm: 'top', rank: 2, rating: 4 },
      { participant: 'p01', trial: 2, style: 'round', color: 'navy', size: 'S', arm: 'random', rank: 12, rating: 2 },
    ])
    expect(() => parseRatings('p,1,a,b,M,best,1,3')).toThrow(/arm must be/)
    expect(() => parseRatings('p,1,a,b,M,top,1,6')).toThrow(/1 to 5/)
    expect(() => parseRatings('p,1,a,b,M,top,1,3.5')).toThrow(/1 to 5/)
  })

  it('perf: requires the numbers and defaults an unknown kind', () => {
    const e = parsePerf({ device: 'x', kind: 'tablet', modelLoadMs: 1, firstDetectionMs: 2, detectFrames: 3, detectMsMedian: 4, detectMsP95: 5, detectFps: 6 })
    expect(e.kind).toBe('other')
    expect(() => parsePerf({ device: 'x' })).toThrow(/modelLoadMs/)
    expect(() => parsePerf({})).toThrow(/device/)
  })
})
