import { create } from 'zustand'

// App theme lives in one store so the sidebar toggle stays in sync everywhere.
// localStorage is the single source of truth (there is no Settings/prefs IPC
// any more) — it gives an instant first paint and persists across restarts.

export type Theme = 'dark' | 'light'

const THEME_KEY = 'scout.theme'

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
    const local = localStorage.getItem(THEME_KEY)
    const initial: Theme = local === 'light' ? 'light' : 'dark'
    apply(initial)
    set({ theme: initial, ready: true })
  },

  setTheme(theme) {
    apply(theme)
    set({ theme })
    localStorage.setItem(THEME_KEY, theme)
  },

  toggle() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  }
}))
