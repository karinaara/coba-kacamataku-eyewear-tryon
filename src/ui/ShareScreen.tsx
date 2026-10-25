import { useEffect, useMemo, useState } from 'react'
import type { CaptureResult } from '../camera/captureResult'
import { canvasToBlob, renderShareCard, type CardFrame } from '../camera/shareCard'
import type { FaceAnalysis } from '../core/analyze'
import { COLOR_BY_ID } from '../core/config/colors'
import { FRAME_STYLES, SIZES } from '../core/config/frames'
import { nicknameFor, shapeLine, shareAltText } from '../core/share'
import type { Recommendations } from '../core/recommend'
import { getFrame, type FrameBitmap } from '../frames/raster'
import type { TryOnPick } from './TryOnScreen'

const styleName = (id: string) => FRAME_STYLES.find((s) => s.id === id)?.name ?? id

/** Screen 6: the share card, made on this device and saved only when the user taps Save or Share. */
export function ShareScreen({
  result,
  analysis,
  recs,
  pick,
  onBack,
}: {
  result: CaptureResult
  analysis: FaceAnalysis
  recs: Recommendations
  pick: TryOnPick | null
  onBack: () => void
}) {
  const [includePhoto, setIncludePhoto] = useState(true)
  const [card, setCard] = useState<{ url: string; blob: Blob } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // What goes on the card: the frame the user has on, and the engine's top three in their best colors.
  const plan = useMemo(() => {
    const styleId = pick?.styleId ?? recs.styles[0]!.styleId
    const colorId = pick?.colorId ?? recs.bestColorFor(styleId).colorId
    const size = pick?.sizeChoice ?? recs.styleById.get(styleId)!.bestSize
    const tint = pick?.tint ?? 'clear'
    const top = recs.topStyles.map((s) => ({ styleId: s.styleId, colorId: recs.bestColorFor(s.styleId).colorId, size: s.bestSize }))
    return { styleId, colorId, size, tint, top }
  }, [pick, recs])

  const labels: CardFrame[] = plan.top.map((t) => ({ name: styleName(t.styleId), color: COLOR_BY_ID.get(t.colorId)?.name ?? t.colorId, entry: null }))
  const nickname = nicknameFor(analysis.shape)
  const alt = shareAltText(analysis.shape, labels, includePhoto)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    setCard(null)
    setError(null)
    ;(async () => {
      try {
        const get = (s: { styleId: string; colorId: string; size: (typeof plan.top)[number]['size']; tint?: typeof plan.tint }) =>
          getFrame({ styleId: s.styleId, colorId: s.colorId, tint: s.tint ?? 'clear', size: s.size })
        const [selected, ...top] = await Promise.all([get(plan), ...plan.top.map((t) => get(t))])
        const factor = (SIZES.find((s) => s.id === plan.size) as (typeof SIZES)[number]).fitFactor
        const canvas = await renderShareCard({
          result,
          selected: { entry: selected as FrameBitmap, sizeFactor: factor },
          nickname,
          shapeLine: shapeLine(analysis.shape),
          top: labels.map((l, i) => ({ ...l, entry: (top[i] as FrameBitmap | undefined) ?? null })),
          includePhoto,
        })
        const blob = await canvasToBlob(canvas)
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setCard({ url, blob })
      } catch (e) {
        console.error(e)
        if (!cancelled) setError('We could not make the card. Please try again.')
      }
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // `labels` and `nickname` derive from `plan` and `analysis`, which are already dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, includePhoto, result, analysis])

  const file = card ? new File([card.blob], 'coba-kacamataku.png', { type: 'image/png' }) : null
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

  const share = async () => {
    if (!file) return
    try {
      await navigator.share({ files: [file], title: 'My frame match', text: `${nickname}: my coba-kacamataku result` })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setNotice('Sharing did not work here. Use Save image instead.')
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-10 pt-4 lg:max-w-4xl lg:px-8">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-accent">Back</button>
        <h1 className="font-display text-base font-bold">Share card</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-10">
      <div className="mx-auto w-full max-w-xs overflow-hidden rounded-3xl bg-dark lg:sticky lg:top-4 lg:max-w-none" style={{ aspectRatio: '9 / 16' }}>
        {card ? (
          <img src={card.url} alt={alt} className="h-full w-full object-contain" />
        ) : (
          <p role="status" className="grid h-full place-items-center px-6 text-center text-sm text-white">
            {error ?? 'Making your card...'}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:pt-4">
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5 accent-accent" checked={includePhoto} onChange={(e) => setIncludePhoto(e.target.checked)} />
        Include my photo
      </label>
      <p className="text-xs text-muted">
        {includePhoto
          ? 'The card shows your face. It is made on this device and is not saved or sent anywhere unless you tap Save image or Share. Untick the box to leave your face out.'
          : 'Your face is left out. The card shows only the glasses, and is made on this device.'}
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!card}
          onClick={() => card && saveBlob(card.blob)}
          className="min-h-12 rounded-2xl bg-accent px-6 text-base font-semibold text-white disabled:opacity-50"
        >
          Save image
        </button>
        {canShare && (
          <button type="button" onClick={() => void share()} className="min-h-12 rounded-2xl bg-chip px-6 text-base font-semibold text-chip-ink">
            Share
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="rounded-2xl bg-white p-3 text-sm">
          {notice}
        </p>
      )}
      </div>
      </div>
    </main>
  )
}

function saveBlob(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'coba-kacamataku.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
