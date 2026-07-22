import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useMemo } from 'react'
import { useAppAuth } from './auth'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export function useSupabaseClient(): SupabaseClient | null {
  const { getToken } = useAppAuth()
  return useMemo(() => {
    if (!supabaseUrl || !supabasePublishableKey) return null
    return createClient(supabaseUrl, supabasePublishableKey, {
      accessToken: getToken,
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }, [getToken])
}
