import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import {
  Home,
  Compass,
  Sparkles,
  FileText,
  Calendar,
  Settings as SettingsIcon,
  Moon,
  Sun,
  ChevronRight,
  ChevronLeft,
  Flame
} from 'lucide-react'

// Clean Core Pages
import Dashboard from './pages/Dashboard'
import TopicRadar from './pages/TopicRadar'
import GeneratePost from './pages/GeneratePost'
import Drafts from './pages/Drafts'
import CalendarPage from './pages/Calendar'
import SettingsPage from './pages/Settings'
import AuthPage from './pages/Auth'

import { ClerkAuthProvider } from './components/ClerkAuthProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { usePosts } from './store'
import { useTheme } from './theme'
import { cn } from '@/renderer/lib/utils'

interface NavItemDef {
  to: string
  label: string
  icon: any
  beta?: boolean
}

const NAV_ITEMS: NavItemDef[] = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/topics', label: 'Topic Radar', icon: Compass, beta: true },
  { to: '/generate', label: 'Generate Post', icon: Sparkles },
  { to: '/drafts', label: 'Drafts', icon: FileText },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/settings', label: 'Settings', icon: SettingsIcon }
]

function Sidebar({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-dashed border-gray-500/40 transition-all duration-200 select-none z-20',
        collapsed ? 'w-20' : 'w-[248px]'
      )}
    >
      {/* Brand — MasterJi-style wordmark in Palanquin */}
      <div className="mt-6 flex h-9 items-center gap-2 px-8">
        <Flame className="h-6 w-6 shrink-0 text-primary" />
        {!collapsed && (
          <span className="font-num text-xl font-semibold tracking-tight text-foreground">
            Post<span className="text-primary">ly</span>
          </span>
        )}
      </div>

      {/* Nav pills — flat orange-400/85 active, space-y-2, px-5 */}
      <nav className="mt-8 flex-1 space-y-2 overflow-y-auto px-5 pb-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon, beta }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn('masterji-sidebar-item', isActive ? 'masterji-sidebar-item-active' : 'masterji-sidebar-item-inactive')
            }
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{label}</span>}
                {!collapsed && beta && (
                  <span className="ml-auto flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-warning" />
                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase tracking-wider',
                        isActive ? 'text-white/90' : 'text-warning'
                      )}
                    >
                      Beta
                    </span>
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User pill pinned to the bottom (MasterJi profile slot) */}
      <div className="relative p-4">
        <div className="flex cursor-default items-center justify-between rounded-2xl border border-dashed border-gray-500/40 px-2.5 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-num text-xs font-semibold text-primary-foreground">
              P
            </div>
            {!collapsed && <span className="truncate text-sm text-foreground">Postly</span>}
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  )
}

function Header({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const navigate = useNavigate()
  return (
    <header className="flex h-14 shrink-0 items-center justify-end px-8 z-10">
      <div className="flex items-center gap-2.5">
        {/* Sign In / Connect — small flat pill like MasterJi header actions */}
        <button
          onClick={() => navigate('/auth')}
          className="flex h-8 items-center gap-2 rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Sign In / Connect</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700/40 text-zinc-500 transition-colors hover:text-foreground dark:text-zinc-300"
          title={dark ? 'Switch to Light mode' : 'Switch to Dark mode'}
        >
          {dark ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </button>
      </div>
    </header>
  )
}

function Shell() {
  const theme = useTheme((s) => s.theme)
  const toggle = useTheme((s) => s.toggle)
  const init = useTheme((s) => s.init)
  const load = usePosts((s) => s.load)

  const [collapsed, setCollapsed] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return window.postly?.on?.('scheduler:tick', () => {
      load()
    })
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '?' && t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setShowShortcuts((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header dark={theme === 'dark'} onToggleTheme={toggle} />

        <main className="flex-1 overflow-y-auto px-6 pb-8 pt-2 lg:px-10">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/topics" element={<TopicRadar />} />
              <Route path="/generate" element={<GeneratePost />} />
              <Route path="/drafts" element={<Drafts />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/events" element={<CalendarPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    </div>
  )
}

export default function App() {
  const theme = useTheme((s) => s.theme)
  return (
    <ClerkAuthProvider>
      <HashRouter>
        <Shell />
        <Toaster position="bottom-right" theme={theme} richColors />
      </HashRouter>
    </ClerkAuthProvider>
  )
}
