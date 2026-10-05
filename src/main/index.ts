// Electron main process: creates the window and wires up IPC.
import { app, BrowserWindow, shell, session } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
// Load .env before the services read process.env.
import '../../backend/db/env'
import { DATA_DIR } from '../../backend/paths'
import { registerIpc } from './ipc'
import { validateEnv, reportEnv } from '../../backend/services/envValidation'
import { hasDatabase, checkDatabaseHealth } from '../../backend/db/client'
import { startScheduler } from '../../backend/services/scheduler'

// Push a scheduler event to every open window so the UI refreshes live.
function broadcastSchedulerTick(count: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('scheduler:tick', count)
  }
}

const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'])

// Dev reads the icon from the repo; packaged builds ship it via extraResources
// (see electron-builder.yml), so it lives beside the executable in resources.

// Surface crashes instead of dying silently.
process.on('uncaughtException', (e) => console.error('[main uncaught]', e))
process.on('unhandledRejection', (e) => console.error('[main rejection]', e))

// Production CSP header (no 'unsafe-inline' for scripts). The browser enforces
// this together with the meta tag, tightening the policy for the shipped app.
// Clerk origins are the one renderer-side network exception (auth SDK).
function enforceProductionCsp(): void {
  if (isDev) return
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://*.clerk.accounts.dev",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://image.pollinations.ai https://img.clerk.com https://images.clerk.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.clerk.accounts.dev https://api.clerk.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'"
  ].join('; ')
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}

// Single-instance keeps the local JSON store consistent.
if (!app.requestSingleInstanceLock()) app.quit()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0b0f',
    title: 'Postly',
    icon: isDev ? join(__dirname, '../../build/icon.png') : join(process.resourcesPath, 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, // renderer only talks to main through the preload bridge
      nodeIntegration: false, // no Node built-ins in the page
      sandbox: false, // preload needs require() for contextBridge; no remote module
      webSecurity: true,
      spellcheck: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Open external links in the default browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block any top-level navigation away from our own content.
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(async () => {
  // Packaged builds store writable data under userData; make sure it exists
  // before initSettings()/postStore try to write into it.
  mkdirSync(DATA_DIR, { recursive: true })

  // macOS: use the bundled PNG as the dock icon (installer icon handled by
  // electron-builder). Harmless no-op on other platforms.
  if (process.platform === 'darwin' && !isDev) {
    try {
      app.dock?.setIcon(join(process.resourcesPath, 'icon.png'))
    } catch {
      /* dock icon is cosmetic; ignore if unavailable */
    }
  }

  enforceProductionCsp()
  registerIpc() // initSettings() runs here and mirrors stored keys into process.env
  reportEnv(validateEnv()) // then validate the fully-resolved environment

  // Verify the Neon connection on startup (non-fatal; app falls back to JSON).
  if (hasDatabase()) {
    const health = await checkDatabaseHealth()
    console.log(
      health.ok
        ? `[db] Neon healthy (${health.latencyMs}ms)`
        : `[db] connection failed — using local storage: ${health.error}`
    )
  } else {
    console.log('[db] DATABASE_URL not set — using local JSON storage')
  }

  createWindow()

  // Start the local scheduler: promotes due scheduled posts to 'pending'.
  startScheduler(broadcastSchedulerTick)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

