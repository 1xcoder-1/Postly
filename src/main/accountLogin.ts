import { BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { setSettings, type SettingsMap } from '../../backend/services/settingsService'
import { invalidateAccountStatusCache } from '../../backend/services/accountStatus'
import type { AccountSource } from '../shared/types'

// In-app account login. Opens an isolated BrowserWindow (its own persistent
// session partition) pointed at the platform's real login page. We poll that
// session's cookie jar until the required auth cookie(s) appear, then persist
// them through the SAME encrypted safeStorage track the Settings page uses.
//
// SECURITY:
//   • The window is sandboxed, has no preload bridge and no Node integration.
//   • Navigation is locked to same-site hosts; anything else is denied or sent
//     to the OS browser (http/https only).
//   • Captured cookie VALUES are written straight to encrypted storage and are
//     never logged, never sent to the renderer, and never included in the result.
//   • Closing the window before capture stores nothing and resolves cleanly.

const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'])

const LOGIN_URLS: Record<AccountSource, string> = {
  x: 'https://x.com/login',
  linkedin: 'https://www.linkedin.com/login',
  reddit: 'https://www.reddit.com/login'
}

// Same-site hosts the login window is allowed to navigate within.
const ALLOWED_HOSTS: Record<AccountSource, string[]> = {
  x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
  reddit: ['reddit.com']
}

export interface AccountLoginResult {
  ok: boolean
  /** Resolved identity is intentionally omitted here — accounts:status covers it. */
  handle?: string
  error?: string
}

// One concurrent login window per source; a second request focuses the first.
const openWindows = new Map<AccountSource, BrowserWindow>()

function hostAllowed(source: AccountSource, host: string): boolean {
  const h = host.toLowerCase()
  return ALLOWED_HOSTS[source].some((allowed) => h === allowed || h.endsWith(`.${allowed}`))
}

/**
 * Reads the required auth cookie(s) out of the login session's jar. Returns a
 * settings patch when everything needed is present, otherwise null. Values are
 * the bare cookie values Electron exposes (no "name=" prefix).
 */
function captureFromJar(
  source: AccountSource,
  jar: Map<string, string>
): SettingsMap | null {
  if (source === 'x') {
    const authToken = jar.get('auth_token')
    const ct0 = jar.get('ct0')
    if (authToken && ct0) return { X_AUTH_TOKEN: authToken, X_CT0: ct0 }
    return null
  }
  if (source === 'linkedin') {
    const liAt = jar.get('li_at')
    return liAt ? { LINKEDIN_LI_AT: liAt } : null
  }
  // reddit: prefer the token_v2 JWT; accept reddit_session as a fallback.
  const token = jar.get('token_v2') || jar.get('reddit_session')
  return token ? { REDDIT_COOKIE: token } : null
}

/**
 * Opens the in-app login window for `source` and resolves once the auth cookie
 * is captured (stored) or the user cancels. Never throws for a normal cancel.
 */
export function openAccountLogin(source: AccountSource): Promise<AccountLoginResult> {
  return new Promise((resolvePromise) => {
    const existing = openWindows.get(source)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      resolvePromise({ ok: false, error: 'already-open' })
      return
    }

    const partition = `persist:postly-login-${source}`
    const ses = session.fromPartition(partition)

    const win = new BrowserWindow({
      width: 500,
      height: 700,
      show: false,
      title: `Sign in to ${source}`,
      backgroundColor: '#0b0b0f',
      icon: isDev ? join(__dirname, '../../build/icon.png') : join(process.resourcesPath, 'icon.png'),
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    })
    openWindows.set(source, win)

    let settled = false
    let poll: ReturnType<typeof setInterval> | null = null

    const finish = (result: AccountLoginResult) => {
      if (settled) return
      settled = true
      if (poll) clearInterval(poll)
      openWindows.delete(source)
      if (!win.isDestroyed()) win.destroy()
      resolvePromise(result)
    }

    // Lock navigation to same-site hosts.
    win.webContents.on('will-navigate', (event, url) => {
      try {
        const u = new URL(url)
        if (!hostAllowed(source, u.hostname)) event.preventDefault()
      } catch {
        event.preventDefault()
      }
    })

    // Same-site popups stay in the window; other http(s) go to the OS browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const u = new URL(url)
        if (hostAllowed(source, u.hostname)) return { action: 'allow' }
        if (u.protocol === 'http:' || u.protocol === 'https:') shell.openExternal(url)
      } catch {
        /* ignore malformed URLs */
      }
      return { action: 'deny' }
    })

    // User closed the window before we captured cookies → clean cancel.
    win.once('closed', () => finish({ ok: false, error: 'cancelled' }))
    win.once('ready-to-show', () => win.show())

    // Poll the cookie jar every 2s until the auth cookie(s) appear.
    poll = setInterval(async () => {
      if (settled) return
      try {
        const cookies = await ses.cookies.get({})
        const jar = new Map<string, string>()
        for (const c of cookies) if (c.value) jar.set(c.name, c.value)
        const patch = captureFromJar(source, jar)
        if (patch) {
          // Persist through the encrypted settings track, then refresh status.
          setSettings(patch)
          invalidateAccountStatusCache()
          finish({ ok: true })
        }
      } catch {
        /* transient cookie-store read error; retry on the next tick */
      }
    }, 2000)

    win.loadURL(LOGIN_URLS[source])
  })
}
