import { Component, type ReactNode, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { posthog } from './lib/posthog'
import { App } from './app'
import './styles.css'
import { initPostHog } from './lib/analytics'

initPostHog()

class PostHogErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    posthog.captureException(error)
    console.error('Hamza Test runtime error:', error)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-dvh place-items-center bg-[#F8FAFC] px-5 text-center">
          <section className="max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-bold text-slate-900">Aplikasi mengalami kendala</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Muat ulang halaman. Jika masalah berlanjut, buka console browser untuk melihat detail error.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 min-h-11 rounded-xl bg-[#006C35] px-4 text-sm font-bold text-white"
            >
              Muat ulang
            </button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogErrorBoundary>
      <App />
      <Analytics />
    </PostHogErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}
