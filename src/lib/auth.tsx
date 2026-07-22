/* eslint-disable react-refresh/only-export-components */

import { ClerkProvider, SignIn, UserButton, useAuth, useClerk, useUser } from '@clerk/react'
import { createContext, useContext, type ReactNode } from 'react'

type AuthContextValue = {
  enabled: boolean
  isLoaded: boolean
  isSignedIn: boolean
  userId: string | null
  displayName: string
  getToken: () => Promise<string | null>
  signOut: () => Promise<void>
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const cloudEnabled = import.meta.env.VITE_ENABLE_CLOUD === 'true'
const AuthContext = createContext<AuthContextValue | null>(null)

const demoAuth: AuthContextValue = {
  enabled: false,
  isLoaded: true,
  isSignedIn: true,
  userId: 'demo-user',
  displayName: 'Mode demo',
  getToken: async () => null,
  signOut: async () => undefined,
}

export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (!clerkPublishableKey) {
    return <AuthContext.Provider value={demoAuth}>{children}</AuthContext.Provider>
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  )
}

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const value: AuthContextValue = {
    enabled: true,
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    userId: userId ?? null,
    displayName: user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Peserta',
    getToken,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAppAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAppAuth must be used inside AppAuthProvider')
  return value
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAppAuth()
  if (!cloudEnabled) return <>{children}</>
  if (!auth.isLoaded) return <main className="grid min-h-dvh place-items-center bg-[#F8FAFC] text-sm font-semibold text-slate-600">Memuat sesi…</main>
  if (!auth.isSignedIn) {
    return (
      <main className="min-h-dvh bg-[#F8FAFC] px-5 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1fr_430px]">
          <section className="hidden rounded-[28px] bg-[#006C35] p-10 text-white shadow-[0_18px_45px_rgba(0,108,53,0.18)] lg:block">
            <div className="grid size-12 place-items-center rounded-2xl bg-white text-xl font-bold text-[#006C35]" dir="rtl">ه</div>
            <p className="mt-10 text-sm font-bold text-emerald-100">Hamza Test · Simulation</p>
            <h1 className="mt-3 max-w-md text-4xl font-bold leading-tight">Latihan lebih terarah, hasil lebih terukur.</h1>
            <p className="mt-5 max-w-md leading-7 text-emerald-50/85">Masuk untuk menyimpan sesi ujian, melihat riwayat, dan melanjutkan latihan dari perangkat mana pun.</p>
          </section>
          <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.07)] sm:p-8">
            <div className="mb-6 text-center lg:hidden">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#006C35] text-xl font-bold text-white" dir="rtl">ه</div>
              <p className="mt-3 text-sm font-bold text-[#006C35]">Hamza Test · Simulation</p>
            </div>
            <SignIn
              routing="hash"
              appearance={{
                variables: {
                  colorPrimary: '#006C35',
                  colorBackground: '#FFFFFF',
                  borderRadius: '0.9rem',
                  fontFamily: 'Arial, Helvetica, sans-serif',
                },
              }}
            />
          </section>
        </div>
      </main>
    )
  }
  return <>{children}</>
}

export function AccountMenu() {
  const auth = useAppAuth()
  if (auth.enabled) return <UserButton userProfileMode="modal" />
  return <span className="rounded-full bg-[#E6F0EB] px-3 py-1.5 text-xs font-bold text-[#006C35]">Mode demo</span>
}
