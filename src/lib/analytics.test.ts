import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock posthog-js
vi.mock('posthog-js', () => {
  const mockPostHog = {
    init: vi.fn(),
    capture: vi.fn(),
    opt_out_capturing: vi.fn(),
  }
  return {
    default: mockPostHog,
    posthog: mockPostHog,
  }
})

import { initPostHog, posthog } from './analytics'

describe('PostHog Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset import.meta.env values via vi.stubEnv if supported, or manually mock
    vi.stubEnv('VITE_POSTHOG_KEY', '')
    vi.stubEnv('VITE_POSTHOG_HOST', '')
  })

  it('does not initialize if VITE_POSTHOG_KEY is not defined', () => {
    initPostHog()
    expect(posthog.init).not.toHaveBeenCalled()
  })

  it('initializes with VITE_POSTHOG_KEY and optional VITE_POSTHOG_HOST', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key')
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://eu.i.posthog.com')

    initPostHog()

    expect(posthog.init).toHaveBeenCalledWith('phc_test_key', expect.objectContaining({
      api_host: 'https://eu.i.posthog.com',
      person_profiles: 'identified_only',
    }))
  })

  it('can capture events via posthog.capture', () => {
    posthog.capture('test_event', { foo: 'bar' })
    expect(posthog.capture).toHaveBeenCalledWith('test_event', { foo: 'bar' })
  })
})
