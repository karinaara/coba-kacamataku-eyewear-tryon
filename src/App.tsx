import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { analyzeImageFile, NoFaceError } from './camera/analyzeImage'
import type { CaptureResult } from './camera/captureResult'
import { profileFromCapture } from './camera/colorFromCapture'
import { analyzeFace } from './core/analyze'
import { EMPTY_PREFS } from './core/preferences'
import { recommend } from './core/recommend'
import type { UndertoneAnswers } from './core/colorProfile'
import { AnalyzingScreen } from './ui/AnalyzingScreen'
import { CameraScreen } from './ui/CameraScreen'
import { CaptureScreen } from './ui/CaptureScreen'
import { CapturedScreen } from './ui/CapturedScreen'
import { ColorProfileScreen } from './ui/ColorProfileScreen'
import { EvalCollectScreen } from './ui/EvalCollectScreen'
import { GalleryScreen } from './ui/GalleryScreen'
import { Landing } from './ui/Landing'
import { PerfScreen } from './ui/PerfScreen'
import { PhotoScreen } from './ui/PhotoScreen'
import { ShareScreen } from './ui/ShareScreen'
import { StudyScreen } from './ui/StudyScreen'
import { TryOnScreen, type TryOnPick } from './ui/TryOnScreen'
import { useLiteMode } from './ui/useLiteMode'
import { useView3D } from './ui/useView3D'
import { usePreferences } from './ui/usePreferences'
import { WhyScreen } from './ui/WhyScreen'

type Screen = 'landing' | 'capture' | 'captured' | 'analyzing' | 'shape' | 'why' | 'colors' | 'study' | 'share' | 'debug' | 'photo' | 'gallery' | 'collect' | 'perf' | 'three'

// Dev server only: left out of the production build entirely.
const ThreeDevScreen = import.meta.env.DEV ? lazy(() => import('./ui/ThreeDevScreen').then((m) => ({ default: m.ThreeDevScreen }))) : null

function initialScreen(): Screen {
  // Developer pages: `?photo=<url>` landmark check, `?gallery` frame gallery, `?collect` evaluation
  // fixtures, `?perf` performance, `?three` 3D frame check (dev server only). `?study` only adds a
  // "rate these frames" button to the try-on screen.
  const q = new URLSearchParams(location.search)
  if (import.meta.env.DEV && q.has('three')) return 'three'
  return q.has('photo') ? 'photo' : q.has('gallery') ? 'gallery' : q.has('collect') ? 'collect' : q.has('perf') ? 'perf' : 'landing'
}

const studyMode = () => new URLSearchParams(location.search).has('study')

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [result, setResult] = useState<CaptureResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // The user's own input to the color profile; kept here so every screen shows the same result.
  const [answers, setAnswers] = useState<UndertoneAnswers | null>(null)
  const [headCovered, setHeadCovered] = useState(false)
  const { prefs, remember, chooseChip, react, clear, setRemember } = usePreferences()
  const [lite, setLite] = useLiteMode()
  const [view3d, setView3d] = useView3D()
  const [pick, setPick] = useState<TryOnPick | null>(null)

  // Pure and cheap, so it is derived from the capture instead of stored.
  const analysis = useMemo(
    () => (result ? analyzeFace(result.landmarks, { width: result.image.width, height: result.image.height }, result.pose) : null),
    [result],
  )

  const profile = useMemo(() => (result ? profileFromCapture(result, { headCovered, answers }) : null), [result, headCovered, answers])

  const recs = useMemo(() => (analysis ? recommend({ shape: analysis.shape, scale: analysis.scale, profile, prefs }) : null), [analysis, profile, prefs])
  // The study judges the engine itself, so its "top three" ignore the participant's taste picks.
  const studyRecs = useMemo(() => (analysis ? recommend({ shape: analysis.shape, scale: analysis.scale, profile, prefs: EMPTY_PREFS }) : null), [analysis, profile])

  const onCaptured = useCallback((r: CaptureResult) => {
    setResult(r)
    setPick(null)
    setAnswers(null)
    setHeadCovered(false)
    setScreen('captured')
  }, [])
  // Merge into the latest answers, so two quick taps never overwrite each other.
  const onAnswer = useCallback(<K extends keyof UndertoneAnswers>(key: K, value: UndertoneAnswers[K]) => {
    setAnswers((prev) => ({ veins: 'unsure', jewelry: 'unsure', sun: 'unsure', ...prev, [key]: value }))
  }, [])
  const onAnalyzed = useCallback(() => setScreen('shape'), [])

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true)
      setUploadError(null)
      try {
        onCaptured(await analyzeImageFile(file))
      } catch (e) {
        console.error(e)
        setUploadError(
          e instanceof NoFaceError
            ? 'We could not find a face in that photo. Try a clear, front-facing photo.'
            : 'We could not read that photo. Try a different image.',
        )
        setScreen('landing')
      } finally {
        setBusy(false)
      }
    },
    [onCaptured],
  )

  const toLanding = () => {
    setResult(null)
    setScreen('landing')
  }

  switch (screen) {
    case 'capture':
      return <CaptureScreen onCaptured={onCaptured} onBack={toLanding} onFile={(f) => void onFile(f)} onDebug={() => setScreen('debug')} lite={lite} onLite={setLite} />
    case 'captured':
      return result ? (
        <CapturedScreen
          result={result}
          onRetake={() => setScreen(result.source === 'camera' ? 'capture' : 'landing')}
          onContinue={() => setScreen('analyzing')}
        />
      ) : null
    case 'analyzing':
      return result ? <AnalyzingScreen result={result} onDone={onAnalyzed} /> : null
    case 'shape':
      return result && analysis && recs ? (
        <TryOnScreen
          result={result}
          analysis={analysis}
          profile={profile}
          recs={recs}
          prefs={prefs}
          remember={remember}
          initialPick={pick}
          onPick={setPick}
          onChip={chooseChip}
          onReact={react}
          onRemember={setRemember}
          onClearPrefs={clear}
          onWhy={() => setScreen('why')}
          onColors={() => setScreen('colors')}
          onStudy={studyMode() ? () => setScreen('study') : undefined}
          onShare={() => setScreen('share')}
          lite={lite}
          onLite={setLite}
          view3d={view3d}
          onView3d={setView3d}
          onRetake={toLanding}
        />
      ) : null
    case 'share':
      return result && analysis && recs ? <ShareScreen result={result} analysis={analysis} recs={recs} pick={pick} onBack={() => setScreen('shape')} /> : null
    case 'study':
      return result && studyRecs ? <StudyScreen result={result} recs={studyRecs} onBack={() => setScreen('shape')} /> : null
    case 'why':
      return analysis && recs ? <WhyScreen analysis={analysis} recs={recs} onBack={() => setScreen('shape')} /> : null
    case 'colors':
      return result ? (
        <ColorProfileScreen
          result={result}
          profile={profile}
          answers={answers}
          headCovered={headCovered}
          onAnswer={onAnswer}
          onClearAnswers={() => setAnswers(null)}
          onHeadCovered={setHeadCovered}
          onBack={() => setScreen('shape')}
          onRetake={toLanding}
        />
      ) : null
    case 'debug':
      return <CameraScreen onBack={() => setScreen('capture')} onPhoto={() => setScreen('photo')} />
    case 'photo':
      return <PhotoScreen onBack={() => setScreen('debug')} />
    case 'gallery':
      return <GalleryScreen onBack={() => setScreen('landing')} />
    case 'collect':
      return <EvalCollectScreen onBack={() => setScreen('landing')} />
    case 'perf':
      return <PerfScreen onBack={() => setScreen('landing')} />
    case 'three':
      return ThreeDevScreen ? (
        <Suspense fallback={null}>
          <ThreeDevScreen onBack={() => setScreen('landing')} />
        </Suspense>
      ) : null
    default:
      return <Landing onScan={() => setScreen('capture')} onFile={(f) => void onFile(f)} busy={busy} error={uploadError} lite={lite} onLite={setLite} />
  }
}




