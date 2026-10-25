import { useCallback, useEffect, useState } from 'react'
import { EMPTY_PREFS, parsePrefs, reactToFrame, serializePrefs, setChip, type Preferences } from '../core/preferences'
import type { StyleChip } from '../core/config/recommend'

const KEY = 'kacamata.prefs.v1'

// Storage can be missing, full or blocked (private windows), so every access is wrapped.
function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
function write(value: string | null) {
  try {
    if (value === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, value)
  } catch {
    // Not saving is fine: the picks still work for this visit.
  }
}

/**
 * Taste picks (a style chip and likes). Kept in memory; saved on this device only if the user turns
 * "remember" on. Only style and color ids and small numbers are stored, never anything about the face.
 */
export function usePreferences() {
  const [remember, setRemember] = useState(() => read() !== null)
  const [prefs, setPrefs] = useState<Preferences>(() => parsePrefs(read()))

  useEffect(() => {
    if (remember) write(serializePrefs(prefs))
  }, [prefs, remember])

  const chooseChip = useCallback((chip: StyleChip | null) => setPrefs((p) => setChip(p, chip)), [])
  const react = useCallback((styleId: string, colorId: string, vote: 1 | -1) => setPrefs((p) => reactToFrame(p, styleId, colorId, vote)), [])
  const clear = useCallback(() => setPrefs(EMPTY_PREFS), [])
  const setRememberOn = useCallback((on: boolean) => {
    setRemember(on)
    if (!on) write(null)
  }, [])

  return { prefs, remember, chooseChip, react, clear, setRemember: setRememberOn }
}
