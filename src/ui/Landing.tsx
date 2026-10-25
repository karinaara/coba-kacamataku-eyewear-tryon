import { useEffect, useRef } from 'react'
import { prefetchModel } from '../camera/landmarker'

interface Props {
  onScan: () => void
  onFile: (file: File) => void
  busy?: boolean
  error?: string | null
  lite: boolean
  onLite: (on: boolean) => void
}

export function Landing({ onScan, onFile, busy, error, lite, onLite }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  // While the user reads this screen, quietly fetch the face model so Scan does not wait for it.
  // Skipped on data saver or a slow connection (see prefetchModel).
  useEffect(() => {
    const id = window.setTimeout(() => void prefetchModel(), 2000)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-10">
      <p className="font-display text-lg font-bold text-accent">coba-kacamataku</p>

      <div className="mt-8 grid aspect-square w-full place-items-center rounded-[28px] bg-accent-tint" aria-hidden="true">
        <svg viewBox="0 0 200 120" className="w-3/4 text-accent" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round">
          <rect x="14" y="30" width="72" height="56" rx="26" />
          <rect x="114" y="30" width="72" height="56" rx="26" />
          <path d="M86 54c8-8 20-8 28 0" />
          <path d="M14 48 2 40M186 48l12-8" />
        </svg>
      </div>

      <h1 className="mt-8 font-display text-4xl font-bold leading-tight">Find frames that suit your face.</h1>
      <p className="mt-3 text-base text-muted">
        We measure your face shape and skin tone, suggest frame shapes and colors, then let you try them on live.
      </p>

      <div className="mt-auto flex flex-col items-center gap-2 pt-8">
        {error && (
          <p role="alert" className="mb-2 w-full rounded-2xl bg-white p-4 text-sm">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onScan}
          className="min-h-14 w-full rounded-2xl bg-accent px-6 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Scan my face
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="min-h-11 rounded-2xl px-4 text-sm font-semibold text-accent disabled:opacity-60"
        >
          {busy ? 'Reading your photo...' : 'or upload a photo'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload a photo"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) onFile(f)
          }}
        />
        <label className="mt-1 flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-accent" checked={lite} onChange={(e) => onLite(e.target.checked)} />
          Lite mode: a lighter camera for slower phones
        </label>
        <p className="mt-2 flex items-center gap-2 text-center text-xs text-muted">
          <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Your photo never leaves your device. Results are style suggestions, not rules.
        </p>
      </div>
    </main>
  )
}
