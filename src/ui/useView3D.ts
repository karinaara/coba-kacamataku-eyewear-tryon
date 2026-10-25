import { useCallback, useState } from 'react'

const KEY = 'kacamata.view3d.v1'

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** The 3D view is off until the user turns it on; the choice is remembered on the device (just a yes/no). */
export function useView3D() {
  const [on, setOn] = useState(read)
  const set = useCallback((value: boolean) => {
    setOn(value)
    try {
      localStorage.setItem(KEY, value ? '1' : '0')
    } catch {
      // Not remembering is fine.
    }
  }, [])
  return [on, set] as const
}
