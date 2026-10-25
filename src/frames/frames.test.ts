import { describe, expect, it } from 'vitest'
import { COLOR_BY_ID, FRAME_COLORS, describeColor } from '../core/config/colors'
import { FRAME_RENDER, FRAME_STYLES, LENS_TINTS, SIZES } from '../core/config/frames'
import { rgbToLab } from '../core/color'
import {
  catalogSize,
  enumerateFrames,
  enumerateVisuals,
  frameKey,
  renderSpec,
  uniqueVisualCount,
  visualKey,
  type FrameSpec,
} from './catalog'
import { generateFrame, roundedPolygon } from './generate'
import { darken, hashString, lighten, mix, seededRandom } from './materials'

/** Minimal XML check: balanced tags, only whitespace between tags, unique ids, resolvable url(#id) refs. */
function checkSvg(svg: string): string[] {
  const problems: string[] = []
  if (!svg.startsWith('<svg ') || !svg.endsWith('</svg>')) problems.push('not wrapped in <svg>')
  if (/NaN|undefined|Infinity|null/.test(svg)) problems.push('contains NaN/undefined/Infinity/null')

  const stack: string[] = []
  const tag = /<(\/?)([A-Za-z][\w:-]*)([^<>]*?)(\/?)>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = tag.exec(svg))) {
    if (svg.slice(last, m.index).trim() !== '') problems.push(`stray text before ${m[2]}`)
    last = m.index + m[0].length
    const [, closing, name, , selfClose] = m
    if (closing) {
      if (stack.pop() !== name) problems.push(`mismatched </${name}>`)
    } else if (!selfClose) stack.push(name as string)
  }
  if (svg.slice(last).trim() !== '') problems.push('trailing text')
  if (stack.length) problems.push(`unclosed: ${stack.join(',')}`)

  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((x) => x[1] as string)
  if (new Set(ids).size !== ids.length) problems.push('duplicate ids')
  for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) if (!ids.includes(ref[1] as string)) problems.push(`dangling url(#${ref[1]})`)

  const vb = svg.match(/viewBox="([^"]+)"/)?.[1]?.split(' ').map(Number)
  if (!vb || vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || (vb[2] as number) <= 0 || (vb[3] as number) <= 0) problems.push('bad viewBox')
  return problems
}

const spec = (styleId: string, colorId: string, tint = 'clear', size = 'M'): FrameSpec => ({ styleId, colorId, tint: tint as FrameSpec['tint'], size: size as FrameSpec['size'] })

describe('catalog size', () => {
  it('has 16 styles, 28 colors, 3 sizes, 4 tints', () => {
    expect(FRAME_STYLES).toHaveLength(16)
    expect(FRAME_COLORS).toHaveLength(28)
    expect(SIZES).toHaveLength(3)
    expect(LENS_TINTS).toHaveLength(4)
  })

  it('enumerates at least 5,000 distinct combinations, matching the computed size', () => {
    const keys = new Set<string>()
    for (const s of enumerateFrames()) keys.add(frameKey(s))
    expect(keys.size).toBe(catalogSize())
    expect(keys.size).toBeGreaterThanOrEqual(5000)
  })

  it('size changes the fit, not the picture', () => {
    expect(visualKey(spec('round', 'gold', 'clear', 'S'))).toBe(visualKey(spec('round', 'gold', 'clear', 'L')))
    expect(frameKey(spec('round', 'gold', 'clear', 'S'))).not.toBe(frameKey(spec('round', 'gold', 'clear', 'L')))
    expect([...enumerateVisuals()]).toHaveLength(uniqueVisualCount())
    expect(SIZES.map((s) => s.fitFactor)).toEqual([0.94, 1, 1.06])
  })
})

describe('every distinct picture renders valid SVG', () => {
  const problems: string[] = []
  const times: number[] = []
  const bySvg = new Map<string, string>()
  let count = 0
  for (const s of enumerateVisuals()) {
    const t0 = performance.now()
    const out = renderSpec(s)
    times.push(performance.now() - t0)
    count++
    for (const p of checkSvg(out.svg)) problems.push(`${visualKey(s)}: ${p}`)
    bySvg.set(out.svg, visualKey(s))
  }

  it('covers all style x color x tint combinations without a problem', () => {
    expect(count).toBe(uniqueVisualCount())
    expect(problems.slice(0, 10)).toEqual([])
  })

  it('draws every combination differently', () => {
    expect(bySvg.size).toBe(count)
  })

  it('generates in well under 5 ms on average', () => {
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    expect(avg).toBeLessThan(5)
  })
})

describe('generateFrame', () => {
  const style = (id: string) => FRAME_STYLES.find((s) => s.id === id)!
  const color = (id: string) => COLOR_BY_ID.get(id)!

  it('is deterministic', () => {
    const a = generateFrame(style('wayfarer'), color('havana-tortoise'), 'clear').svg
    const b = generateFrame(style('wayfarer'), color('havana-tortoise'), 'clear').svg
    expect(a).toBe(b)
  })

  it('draws all 16 styles differently for the same color', () => {
    const svgs = new Set(FRAME_STYLES.map((s) => generateFrame(s, color('jet-black'), 'clear').svg))
    expect(svgs.size).toBe(16)
  })

  it('uses a pattern for tortoise, a gradient for metal, and an edge for translucent', () => {
    expect(generateFrame(style('wayfarer'), color('havana-tortoise'), 'clear').svg).toContain('<pattern')
    expect(generateFrame(style('round'), color('gold'), 'clear').svg).toContain('<linearGradient')
    const clear = generateFrame(style('wayfarer'), color('clear-pink'), 'clear').svg
    expect(clear).toContain('stroke-opacity="0.62"')
    expect(clear).toContain('stroke-opacity="0.55"') // darker outline
    expect(generateFrame(style('wayfarer'), color('jet-black'), 'clear').svg).not.toContain('<pattern')
  })

  it('browline is two-tone: the color on the brow bar and a paired metal below', () => {
    const warm = generateFrame(style('browline'), color('chocolate'), 'clear').svg
    expect(warm).toContain('<linearGradient') // metal for the lower rim
    expect(warm).toContain(lighten('#C9A227', 0.5)) // gold gradient under a warm color
    const cool = generateFrame(style('browline'), color('navy'), 'clear').svg
    expect(cool).toContain(lighten('#BFC5CC', 0.5)) // silver gradient under a cool one
    // A non-two-tone style with the same color has no metal at all.
    expect(generateFrame(style('wayfarer'), color('chocolate'), 'clear').svg).not.toContain('<linearGradient')
  })

  it('applies each lens tint', () => {
    const tintOf = (t: (typeof LENS_TINTS)[number]['id']) => generateFrame(style('square'), color('jet-black'), t).svg
    expect(tintOf('dark')).toContain('fill-opacity="0.86"')
    expect(tintOf('light-grey')).toContain('fill-opacity="0.24"')
    expect(tintOf('brown-gradient')).toMatch(/<linearGradient id="[^"]+t"/)
    expect(tintOf('clear')).toContain('fill-opacity="0.1"')
  })

  it('sizes every frame front to the same width and keeps anchors inside the picture', () => {
    for (const s of FRAME_STYLES) {
      const g = generateFrame(s, color('jet-black'), 'clear')
      expect(g.frontBox.w).toBe(FRAME_RENDER.frontWidth)
      const a = g.anchors
      expect(a.leftLensCenter.x).toBeCloseTo(-a.rightLensCenter.x, 6)
      expect(a.leftHinge.x).toBeCloseTo(-a.rightHinge.x, 6)
      expect(a.bridge.x).toBe(0)
      const vb = g.svg.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number) as [number, number, number, number]
      for (const p of [a.leftLensCenter, a.rightLensCenter, a.leftHinge, a.rightHinge, a.bridge]) {
        expect(p.x).toBeGreaterThan(vb[0])
        expect(p.x).toBeLessThan(vb[0] + vb[2])
        expect(p.y).toBeGreaterThan(vb[1])
        expect(p.y).toBeLessThan(vb[1] + vb[3])
      }
      expect(g.width).toBeCloseTo(vb[2], 0)
    }
  })

  it('round lenses stay round and cat-eye lifts the outer corner', () => {
    const round = generateFrame(style('round'), color('jet-black'), 'clear')
    const cat = generateFrame(style('cat-eye'), color('jet-black'), 'clear')
    expect(round.anchors.leftHinge.y).toBeGreaterThan(cat.anchors.leftHinge.y) // cat-eye hinge sits higher
  })
})

describe('roundedPolygon', () => {
  it('turns a rectangle into four cubic corners and closes the path', () => {
    const rect = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]
    const d = roundedPolygon(rect, [1, 1, 1, 1])
    expect(d.match(/C/g)).toHaveLength(4)
    expect(d.endsWith('Z')).toBe(true)
    // With full roundness the path passes through the edge midpoints, so it is an exact ellipse.
    for (const mid of ['50 0', '100 25', '50 50', '0 25']) expect(d).toContain(mid)
  })

  it('keeps sharp corners when the radius is 0', () => {
    const d = roundedPolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], [0, 0, 0])
    expect(d).toContain('M0 0')
  })
})

describe('palette', () => {
  it('has unique ids, valid hexes, and the brief\'s group sizes', () => {
    expect(new Set(FRAME_COLORS.map((c) => c.id)).size).toBe(28)
    for (const c of FRAME_COLORS) expect(c.hex).toMatch(/^#[0-9A-Fa-f]{6}$/)
    const count = (fam: string) => FRAME_COLORS.filter((c) => c.family === fam).length
    expect([count('neutral'), count('brown'), count('metal'), count('blue-green'), count('warm-bright'), count('translucent')]).toEqual([4, 4, 5, 6, 5, 4])
  })

  it('precomputes Lab from the hex values', () => {
    const gold = COLOR_BY_ID.get('gold')!
    expect(gold.lab).toEqual(rgbToLab(0xc9, 0xa2, 0x27))
    expect(gold.lightness).toBe(gold.lab[0])
    expect(gold.chroma).toBeCloseTo(Math.hypot(gold.lab[1], gold.lab[2]), 8)
  })

  it('calls obvious colors warm, cool or neutral', () => {
    const t = (id: string) => COLOR_BY_ID.get(id)!.temperature
    for (const id of ['gold', 'caramel', 'mustard', 'terracotta', 'coral', 'havana-tortoise', 'olive']) expect(t(id), id).toBe('warm')
    for (const id of ['navy', 'cobalt', 'teal']) expect(t(id), id).toBe('cool')
    // Low-chroma greys are neutral, including gunmetal and slate (chroma under TEMPERATURE.neutralChroma).
    for (const id of ['jet-black', 'silver', 'slate', 'gunmetal', 'crystal-clear']) expect(t(id), id).toBe('neutral')
  })

  it('describeColor is pure', () => {
    expect(describeColor({ id: 'x', name: 'X', hex: '#C9A227', material: 'metal', family: 'metal' }).temperature).toBe('warm')
  })
})

describe('material helpers', () => {
  it('mixes, lightens and darkens', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(lighten('#000000', 1)).toBe('#ffffff')
    expect(darken('#ffffff', 1)).toBe('#000000')
  })
  it('hashes and random numbers are deterministic', () => {
    expect(hashString('gold')).toBe(hashString('gold'))
    expect(hashString('gold')).not.toBe(hashString('silver'))
    const a = seededRandom(7)
    const b = seededRandom(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})
