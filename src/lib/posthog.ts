import posthog from 'posthog-js'

const token = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN as string | undefined
const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined

if (token) {
  posthog.init(token, {
    api_host: host || 'https://us.i.posthog.com',
    defaults: '2026-01-30',
    capture_exceptions: true,
    debug: import.meta.env.DEV,
  })
} else if (import.meta.env.DEV) {
  console.error(
    'VITE_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, ' +
      'this causes events to be silently missed. This error stops appearing once VITE_PUBLIC_POSTHOG_PROJECT_TOKEN is configured',
  )
}

export { posthog }
