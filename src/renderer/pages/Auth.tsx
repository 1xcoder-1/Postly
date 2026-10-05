import { useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useSignIn, useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { Flame, ShieldCheck, Zap, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { api } from '@/renderer/lib/api'
import { useAppAuth } from '@/renderer/components/ClerkAuthProvider'
import { GithubIcon, XIcon, LinkedinIcon, RedditIcon } from '@/renderer/components/BrandIcons'

type ClerkOAuthStrategy = 'oauth_github' | 'oauth_x' | 'oauth_linkedin_oidc' | 'oauth_google'

interface SocialProvider {
  id: string
  name: string
  icon: ComponentType<{ className?: string }>
  clerkStrategy?: ClerkOAuthStrategy
  sourceKey: 'github' | 'x' | 'linkedin' | 'reddit'
}

const SOCIAL_PROVIDERS: SocialProvider[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: GithubIcon,
    clerkStrategy: 'oauth_github',
    sourceKey: 'github'
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    icon: XIcon,
    clerkStrategy: 'oauth_x',
    sourceKey: 'x'
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: LinkedinIcon,
    clerkStrategy: 'oauth_linkedin_oidc',
    sourceKey: 'linkedin'
  },
  {
    id: 'reddit',
    name: 'Reddit',
    icon: RedditIcon,
    sourceKey: 'reddit'
  }
]

export default function AuthPage() {
  const { isClerkConfigured } = useAppAuth()
  return isClerkConfigured ? <ClerkAuthView /> : <LocalAuthView />
}

// Loopback OAuth portal in the main process — works with no Clerk at all.
function useLocalConnect() {
  const navigate = useNavigate()
  return async (provider: SocialProvider) => {
    toast.info(`Opening ${provider.name} in your browser…`, { duration: 4000 })
    try {
      const res = await api.accountsLogin(provider.sourceKey)
      if (res.ok) {
        toast.success(`Connected to ${provider.name} successfully!`)
        navigate('/')
      } else if (res.error && res.error !== 'cancelled') {
        toast.error(res.error)
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
}

function LocalAuthView() {
  const onConnect = useLocalConnect()
  return <AuthView onConnect={onConnect} />
}

function ClerkAuthView() {
  const navigate = useNavigate()
  const { signIn, isLoaded: isSignInLoaded } = useSignIn()
  const { user, isLoaded: isUserLoaded } = useUser()
  const localConnect = useLocalConnect()

  const onConnect = async (provider: SocialProvider) => {
    if (provider.clerkStrategy && isSignInLoaded && signIn) {
      await signIn.authenticateWithRedirect({
        strategy: provider.clerkStrategy,
        redirectUrl: 'http://127.0.0.1:4321/callback',
        redirectUrlComplete: '/'
      })
      return
    }
    // Clerk not loaded (blocked/offline/misconfigured) or provider has no
    // Clerk strategy — fall back to the desktop browser OAuth portal.
    await localConnect(provider)
  }

  return (
    <AuthView
      onConnect={onConnect}
      banner={
        isUserLoaded && user ? (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3.5">
            <div className="flex items-center gap-3">
              <img
                src={user.imageUrl}
                alt={user.fullName || 'User'}
                className="h-9 w-9 rounded-full border border-emerald-500/40"
              />
              <div>
                <p className="text-xs font-medium text-foreground">{user.fullName || user.username}</p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Authenticated via Clerk</p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate('/')}>
              Continue <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null
      }
    />
  )
}

interface AuthViewProps {
  onConnect: (provider: SocialProvider) => Promise<void>
  banner?: React.ReactNode
}

function AuthView({ onConnect, banner }: AuthViewProps) {
  const [connecting, setConnecting] = useState<string | null>(null)

  const handleSocialAuth = async (provider: SocialProvider) => {
    setConnecting(provider.id)
    try {
      await onConnect(provider)
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div className="relative flex min-h-[90vh] items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-[400px] rounded-[14px] border border-border bg-card p-8 shadow-card"
      >
        {/* Brand Header */}
        <div className="mb-8 space-y-2 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Flame className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-[22px] font-medium tracking-tight text-foreground">
            Welcome to <span className="text-primary">Postly</span>
          </h1>
          <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted-foreground">
            AI-powered social media studio. Connect your account to enable live crawling & automated post drafting.
          </p>
        </div>

        {banner}

        {/* Social Login Buttons */}
        <div className="space-y-3">
          <div className="mb-2.5 text-center text-xs text-muted-foreground">1-Click Social Sign In</div>

          <div className="grid gap-2.5">
            {SOCIAL_PROVIDERS.map((p) => {
              const isLoading = connecting === p.id
              const Icon = p.icon
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSocialAuth(p)}
                  disabled={Boolean(connecting)}
                  className="group flex w-full items-center justify-between rounded-lg border border-border bg-zinc-800/40 px-4 py-3 text-left transition-colors hover:border-foreground/25 hover:bg-secondary/60 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-foreground" />
                    <div>
                      <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        Continue with {p.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">Fast web authorization</div>
                    </div>
                  </div>

                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Security & Features Footer */}
        <div className="mt-8 flex items-center justify-between border-t border-border pt-5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> OS-Encrypted Session
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-warning" /> Zero Rate Limits
          </span>
        </div>
      </motion.div>
    </div>
  )
}
