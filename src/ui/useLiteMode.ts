import { useCallback, useState } from 'react'

const KEY = 'kacamata.lite.v1'

function read(): boolean | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === null ? null : v === '1'
  } catch {
    return null
  }
}

/** Data saver or a very low-memory device: start in lite mode. Anything else starts in full mode. */
function autoDefault(): boolean {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  return n.connection?.saveData === true || (typeof n.deviceMemory === 'number' && n.deviceMemory <= 2)
}

/**
 * Lite mode: a lower-resolution camera and detection at most 15 times a second, for slower phones.
 * The user's choice is remembered on the device (just a yes/no, nothing about them).
 */
export function useLiteMode() {
  const [lite, setLite] = useState(() => read() ?? autoDefault())
  const set = useCallback((on: boolean) => {
    setLite(on)
    try {
      localStorage.setItem(KEY, on ? '1' : '0')
    } catch {
      // Not remembering is fine.
    }
  }, [])
  return [lite, set] as const
}
