import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
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
  Flame,
  Keyboard
} from 'lucide-react'

// Clean Core Pages
import Dashboard from './pages/Dashboard'
import TopicRadar from './pages/TopicRadar'
import GeneratePost from './pages/GeneratePost'
import Drafts from './pages/Drafts'
import CalendarPage from './pages/Calendar'
import SettingsPage from './pages/Settings'

import { ErrorBoundary } from './components/ErrorBoundary'
import { NoticeBoardModal } from './components/NoticeBoardModal'
import { UserProfileModal } from './components/UserProfileModal'
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

function Sidebar({
  collapsed,
  onToggleCollapse,
  onOpenProfile
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenProfile: () => void
}) {
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-[#1f1f24] bg-[#0e0e11] transition-all duration-200 select-none z-20',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Brand Logo */}
      <div className="flex h-16 items-center justify-between px-5 border-b border-[#1b1b20]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#f06e1e] to-[#fb923c] shadow-md shadow-orange-950/40">
            <Flame className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <span className="text-lg font-extrabold tracking-tight text-white flex items-center gap-1">
              Post<span className="text-[#f06e1e]">ly</span>
            </span>
          )}
        </div>
      </div>

      {/* Clean Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, beta }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all group',
                isActive
                  ? 'bg-gradient-to-r from-[#f06e1e] to-[#e45b13] text-white shadow-lg shadow-orange-900/30'
                  : 'text-zinc-400 hover:bg-[#18181c] hover:text-zinc-100'
              )
            }
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors',
                    isActive ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'
                  )}
                />
                {!collapsed && (
                  <span className="flex-1 truncate">{label}</span>
                )}
                {!collapsed && beta && (
                  <span
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-wider',
                      isActive ? 'text-white/90' : 'text-amber-400'
                    )}
                  >
                    • BETA
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User profile bottom pill */}
      <div className="border-t border-[#1b1b20] p-3">
        <div
          onClick={onOpenProfile}
          className="flex cursor-pointer items-center justify-between rounded-2xl border border-[#232328] bg-[#141417] p-2 transition-colors hover:border-primary/40 hover:bg-[#18181c]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#f06e1e] to-[#fb923c] font-bold text-xs text-white">
              1x
            </div>
            {!collapsed && (
              <span className="truncate text-xs font-semibold text-zinc-200">1xcoder</span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse()
            }}
            className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  )
}

function Header({
  onOpenNotice,
  dark,
  onToggleTheme
}: {
  onOpenNotice: () => void
  dark: boolean
  onToggleTheme: () => void
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-end border-b border-[#1f1f24] bg-[#0e0e11]/90 px-8 backdrop-blur z-10">
      <div className="flex items-center gap-3">
        {/* Notice Board Button with gold badge */}
        <button
          onClick={onOpenNotice}
          className="flex items-center gap-2 rounded-full border border-[#27272a] bg-[#161619] px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition-all hover:border-primary/40 hover:bg-[#1c1c20]"
        >
          <span>Notice Board</span>
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 font-mono text-[10px] font-bold text-black">
            1
          </span>
        </button>

        {/* Theme Crescent Toggle */}
        <button
          onClick={onToggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#27272a] bg-[#161619] text-zinc-300 transition-colors hover:border-primary/40 hover:text-white"
          title={dark ? 'Switch to Light mode' : 'Switch to Dark mode'}
        >
          {dark ? (
            <Moon className="h-4 w-4 fill-zinc-300 text-zinc-300" />
          ) : (
            <Sun className="h-4 w-4 text-amber-500" />
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
  const [showNoticeBoard, setShowNoticeBoard] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
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
    <div className="flex h-screen overflow-hidden bg-[#0a0a0c] text-foreground">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        onOpenProfile={() => setShowProfile(true)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onOpenNotice={() => setShowNoticeBoard(true)}
          dark={theme === 'dark'}
          onToggleTheme={toggle}
        />

        <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-10 lg:py-8">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
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

      {showNoticeBoard && <NoticeBoardModal onClose={() => setShowNoticeBoard(false)} />}
      {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    </div>
  )
}

export default function App() {
  const theme = useTheme((s) => s.theme)
  return (
    <HashRouter>
      <Shell />
      <Toaster position="bottom-right" theme={theme} richColors />
    </HashRouter>
  )
}
