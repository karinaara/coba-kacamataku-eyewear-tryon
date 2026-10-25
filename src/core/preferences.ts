// Per-user taste: a Minimal / Classic / Bold chip and like / dislike taps (brief section 8.4). Pure.
// Stores only choices (style and color ids, small numbers), never anything about the face.

import { RECOMMEND, STYLE_CHIPS, type StyleChip } from './config/recommend'

export interface Preferences {
  chip: StyleChip | null
  /** Per style id, a running total of likes (+) and dislikes (-), capped. */
  styleLikes: Record<string, number>
  /** Per color id, the same. */
  colorLikes: Record<string, number>
}

export const EMPTY_PREFS: Preferences = { chip: null, styleLikes: {}, colorLikes: {} }

const clamp = (v: number, cap: number) => Math.max(-cap, Math.min(cap, v))
const round = (v: number) => Math.round(v * 1000) / 1000

/** Adds `delta` to one entry, capped; an entry that returns to 0 is removed rather than stored. */
function bump(map: Record<string, number>, id: string, delta: number, cap: number): Record<string, number> {
  const next = round(clamp((map[id] ?? 0) + delta, cap))
  const { [id]: _removed, ...rest } = map
  void _removed
  return next === 0 ? rest : { ...rest, [id]: next }
}

export function setChip(p: Preferences, chip: StyleChip | null): Preferences {
  return { ...p, chip }
}

/** A like (+1) or dislike (-1) on the frame currently shown. */
export function reactToFrame(p: Preferences, styleId: string, colorId: string, vote: 1 | -1): Preferences {
  const { likeStep, colorStep, styleCap, colorCap } = RECOMMEND.pref
  return {
    ...p,
    styleLikes: bump(p.styleLikes, styleId, vote * likeStep, styleCap),
    colorLikes: bump(p.colorLikes, colorId, vote * colorStep, colorCap),
  }
}

export const hasPrefs = (p: Preferences) => p.chip !== null || Object.keys(p.styleLikes).length > 0 || Object.keys(p.colorLikes).length > 0

export const serializePrefs = (p: Preferences) => JSON.stringify(p)

/** Reads saved preferences defensively: anything unexpected falls back to empty rather than throwing. */
export function parsePrefs(text: string | null): Preferences {
  if (!text) return EMPTY_PREFS
  try {
    const raw: unknown = JSON.parse(text)
    if (typeof raw !== 'object' || raw === null) return EMPTY_PREFS
    const r = raw as Record<string, unknown>
    const chip = STYLE_CHIPS.find((c) => c === r.chip) ?? null
    const likes = (v: unknown, cap: number): Record<string, number> => {
      if (typeof v !== 'object' || v === null) return {}
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
          .map(([k, n]) => [k, clamp(n, cap)]),
      )
    }
    return { chip, styleLikes: likes(r.styleLikes, RECOMMEND.pref.styleCap), colorLikes: likes(r.colorLikes, RECOMMEND.pref.colorCap) }
  } catch {
    return EMPTY_PREFS
  }
}
