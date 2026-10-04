import { create } from 'zustand'
import { api } from './lib/api'

// App theme lives in one store so the sidebar toggle and the Settings page stay
// in sync. localStorage gives an instant first paint; the `theme` preference
// (persisted through the prefs store) is the durable source of truth.

export type Theme = 'dark' | 'light'

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

interface ThemeState {
  theme: Theme
  ready: boolean
  init: () => Promise<void>
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: 'dark',
  ready: false,

  async init() {
    const local = localStorage.getItem('postly.theme')
    const initial: Theme = local === 'light' ? 'light' : 'dark'
    apply(initial)
    set({ theme: initial, ready: true })
    try {
      const prefs = await api.getPrefs()
      if (prefs.theme === 'light' || prefs.theme === 'dark') {
        apply(prefs.theme)
        set({ theme: prefs.theme })
        localStorage.setItem('postly.theme', prefs.theme)
      }
    } catch {
      /* prefs unavailable — localStorage value stands for this session */
    }
  },

  setTheme(theme) {
    apply(theme)
    set({ theme })
    localStorage.setItem('postly.theme', theme)
    api.setPref('theme', theme).catch(() => {})
  },

  toggle() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  }
}))
