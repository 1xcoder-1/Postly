import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import {
  Home,
  Compass,
  PenLine,
  FileText,
  Calendar,
  Moon,
  Sun,
  ChevronRight,
  ChevronLeft
} from 'lucide-react'
import { GradientLogo } from './components/BrandIcons'

// Clean Core Pages
import Dashboard from './pages/Dashboard'
import TopicRadar from './pages/TopicRadar'
import TopicDetailPage from './pages/TopicDetail'
import WritePost from './pages/WritePost'
import Drafts from './pages/Drafts'
import CalendarPage from './pages/Calendar'

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
  { to: '/write', label: 'Write Post', icon: PenLine },
  { to: '/drafts', label: 'Drafts', icon: FileText },
  { to: '/calendar', label: 'Calendar', icon: Calendar }
]

// Static identity slot at the sidebar bottom. The app is local single-user:
// rows are scoped to a stable per-device id in the main process.
function LocalUserPill({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
        <GradientLogo className="h-5 w-5" />
      </div>
      {!collapsed && <span className="truncate text-sm text-foreground">Scout</span>}
    </div>
  )
}

function Sidebar({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-dashed border-gray-500/40 transition-all duration-200 select-none z-20',
        collapsed ? 'w-20' : 'w-[248px]'
      )}
    >
      {/* Brand — same violet→cyan gradient mark as the app icon (build/icon.png) */}
      <div className="mt-6 flex h-9 items-center gap-2 px-8">
        <GradientLogo className="h-7 w-7 shrink-0" />
        {!collapsed && (
          <span className="bg-gradient-to-r from-violet-500 to-cyan-400 bg-clip-text font-num text-xl font-semibold tracking-tight text-transparent">
            Scout
          </span>
        )}
      </div>

      {/* Nav pills — flat orange-400/85 active, space-y-2, px-5 */}
      <nav className="no-scrollbar mt-8 flex-1 space-y-2 overflow-y-auto px-5 pb-4">
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

      {/* User pill pinned to the bottom (MasterJi profile slot). */}
      <div className="relative p-4">
        <div className="flex cursor-default items-center justify-between rounded-2xl border border-dashed border-gray-500/40 px-2.5 py-2">
          <LocalUserPill collapsed={collapsed} />
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
  const location = useLocation()
  // Current page title, surfaced in the top navbar so the page body no longer
  // needs its own big heading.
  const title = NAV_ITEMS.find((n) => n.to === location.pathname)?.label ?? 'Dashboard'
  return (
    // Navbar: full-width bar with a surface slightly lifted off the app body
    // (bg-card + bottom border + blur) so the title reads as a distinct top
    // navigation strip.
    <header className="z-10 flex h-14 shrink-0 items-center justify-between gap-2.5 border-b border-border bg-card/70 px-6 backdrop-blur-sm sm:px-8">
      <h1 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h1>

      <div className="flex items-center gap-2.5">
        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 text-zinc-500 transition-colors hover:bg-secondary hover:text-foreground dark:text-zinc-300"
          title={dark ? 'Switch to Light mode' : 'Switch to Dark mode'}
        >
          {dark ? (
            <Moon className="h-3.5 w-3.5" />
          ) : (
            <Sun className="h-3.5 w-3.5" />
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

  // Load the local user's posts once on mount; the scheduler tick listener
  // keeps the UI fresh when items come due.
  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return window.postly?.on?.('scheduler:tick', () => {
      void load()
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

        <main className="no-scrollbar flex-1 overflow-y-auto px-6 pb-8 pt-2 lg:px-10">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/topics" element={<TopicRadar />} />
              <Route path="/topic" element={<TopicDetailPage />} />
              <Route path="/write" element={<WritePost />} />
              <Route path="/drafts" element={<Drafts />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/events" element={<CalendarPage />} />
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
  // Top-level boundary: without it, a throw anywhere above <main>'s own
  // boundary unmounts the tree and leaves a blank window.
  return (
    <ErrorBoundary>
      <HashRouter>
        <Shell />
        <Toaster position="bottom-right" theme={theme} richColors />
      </HashRouter>
    </ErrorBoundary>
  )
}
