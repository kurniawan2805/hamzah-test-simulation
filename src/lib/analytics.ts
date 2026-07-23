import posthog from 'posthog-js'

export function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

  if (key) {
    posthog.init(key, {
      api_host: host,
      person_profiles: 'identified_only', // PostHog 3.x default behavior
      loaded: (ph) => {
        if (import.meta.env.DEV) {
          ph.opt_out_capturing() // Disable capturing in local dev if desired, or keep it open
        }
      }
    })
  }
}

export { posthog }
