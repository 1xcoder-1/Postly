import React, { createContext, useContext, useMemo } from 'react'
import { ClerkProvider } from '@clerk/clerk-react'

// Clerk is optional: mounted only when a publishable key is configured. The
// key must come from the environment — a stale/revoked key makes clerk-js fail
// on every launch, so nothing is hardcoded here.
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || ''

interface AuthContextType {
  isClerkConfigured: boolean
}

const AuthContext = createContext<AuthContextType>({ isClerkConfigured: false })

export const useAppAuth = () => useContext(AuthContext)

export function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  const isClerkConfigured = CLERK_PUBLISHABLE_KEY.startsWith('pk_')
  const value = useMemo(() => ({ isClerkConfigured }), [isClerkConfigured])

  if (!isClerkConfigured) return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>

  return (
    <AuthContext.Provider value={value}>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>{children}</ClerkProvider>
    </AuthContext.Provider>
  )
}
