import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/**
 * Last line of defence: if a screen crashes, show a plain message instead of a blank page.
 * It logs the error to the console only. Nothing is sent anywhere, and no picture or face data is logged.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] a screen crashed', error.message, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
        <p className="text-muted" role="alert">
          The app hit a problem and had to stop. Nothing was uploaded: your photo stays on this device and is gone once you reload.
        </p>
        <button type="button" onClick={() => location.reload()} className="min-h-12 rounded-2xl bg-accent px-6 text-base font-semibold text-white">
          Start again
        </button>
      </main>
    )
  }
}
