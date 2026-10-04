import { ipcMain, app, shell } from 'electron'
import { generatePostContent, variantToDraft } from '../../backend/services/generateService'
import { getDailyTopics, fetchAgentReachStatus } from '../../backend/services/crawlerService'
import { testApiKey, type SecretKey } from '../../backend/services/keyTest'
import { runSchedulerOnce } from '../../backend/services/scheduler'
import { checkForUpdates } from '../../backend/services/updater'
import {
  savePost,
  listPosts,
  deletePost,
  recordRejection,
  clearRejections,
  countRejections,
  setStatus
} from '../../backend/db/postStore'
import { getSettings, setSettings, initSettings, hasDatabase } from '../../backend/services/settingsService'
import { getAccountStatuses, invalidateAccountStatusCache } from '../../backend/services/accountStatus'
import { openAccountLogin } from './accountLogin'
import { checkDatabaseHealth } from '../../backend/db/client'
import { allSettings, setSetting, getSetting } from '../../backend/db/settingsRepo'
import { usageSnapshot, recentLog, resetUsage } from '../../backend/ai/usage'
import { TEXT_PROVIDERS } from '../../backend/ai/textProviders'
import { IMAGE_PROVIDERS } from '../../backend/ai/imageProviders'
import type { GeneratePostInput, PostRecord, DailyTopicsOptions, PostStatus, AccountSource } from '../shared/types'

// Sources accepted by the accounts:login channel (validated before spawning a
// login window / touching the encrypted settings track).
const ACCOUNT_SOURCES: AccountSource[] = ['x', 'linkedin', 'reddit']

// Wraps every handler so a thrown error becomes a structured { ok:false }
// the renderer can display, instead of an unhandled rejection.
function handle<T>(channel: string, fn: (payload: T) => Promise<unknown> | unknown) {
  ipcMain.handle(channel, async (_event, payload: T) => {
    try {
      return { ok: true, data: await fn(payload) }
    } catch (e) {
      console.error(`[ipc ${channel}]`, e)
      return { ok: false, error: (e as Error).message }
    }
  })
}

// Opens an external URL in the system browser. CSP blocks window.open and
// form submissions from the renderer, so links must pass through main. Only
// http(s) to official social platforms is allowed — anything else throws.
const ALLOWED_HOSTS = [
  'x.com',
  'twitter.com',
  'linkedin.com',
  'instagram.com',
  'threads.net',
  'threads.com',
  'reddit.com'
]

function openExternal(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http(s) links can be opened')
  }
  const host = parsed.hostname.toLowerCase()
  const allowed = ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  if (!allowed) throw new Error(`Host not allowed: ${host}`)
  shell.openExternal(parsed.toString())
}

export function registerIpc(): void {
  initSettings()

  handle('topics:fetch', (opts?: DailyTopicsOptions) => getDailyTopics(opts ?? {}))
  handle('agentreach:status', (refresh?: boolean) => fetchAgentReachStatus(!!refresh))
  handle('post:generate', (input: GeneratePostInput) => generatePostContent(input))
  handle('post:toDraft', (payload: { topic: string; variant: any; imageUrl: string | null; slides: any }) =>
    variantToDraft(payload.topic, payload.variant, payload.imageUrl, payload.slides)
  )
  handle('post:save', (record: PostRecord) => savePost(record))
  handle('post:list', (status?: string) => listPosts(status as any))
  handle('post:delete', (id: string) => deletePost(id))
  handle('post:reject', (payload: { record: PostRecord; reason: string | null; notes?: string | null }) =>
    recordRejection(payload.record, payload.reason, payload.notes ?? null)
  )

  handle('settings:get', () => getSettings())
  handle('settings:set', (patch: any) => {
    const result = setSettings(patch)
    // Saved cookie secrets change per-account connectivity — drop the status
    // cache so the next accounts:status call re-probes with the new values.
    invalidateAccountStatusCache()
    return result
  })
  handle('db:check', () => hasDatabase())
  handle('db:health', () => checkDatabaseHealth())

  // Account-login crawling: open an in-app login window and capture the auth
  // cookie(s), plus a live per-source connection status. Neither channel ever
  // returns a cookie value — only ok/handle/error and status metadata.
  handle('accounts:login', (payload: { source: AccountSource }) => {
    const source = payload?.source
    if (!source || !ACCOUNT_SOURCES.includes(source)) throw new Error('Invalid account source')
    return openAccountLogin(source)
  })
  handle('accounts:status', () => getAccountStatuses())

  // AI model status: per-model availability, daily usage and recent attempts.
  handle('ai:status', () => ({
    models: usageSnapshot([
      ...TEXT_PROVIDERS.map((p) => ({ name: p.name, label: p.label, kind: 'text' as const, dailyCap: p.dailyCap, hasKey: p.isAvailable })),
      ...IMAGE_PROVIDERS.map((p) => ({ name: p.name, label: p.label, kind: 'image' as const, dailyCap: p.dailyCap, hasKey: p.isAvailable }))
    ]),
    recent: recentLog()
  }))

  // Non-secret app preferences backed by the `settings` table (or JSON file).
  handle('prefs:all', () => allSettings())
  handle('prefs:set', (payload: { key: string; value: string }) => setSetting(payload.key, payload.value))
  handle('prefs:get', (key: string) => getSetting(key))

  // Verify an API key without spending generation quota (never returns the key).
  handle('key:test', (key: SecretKey) => testApiKey(key).then((r) => ({ key, ...r })))

  // Rejection-learning controls for the Settings page.
  handle('rejections:count', () => countRejections())
  handle('rejections:clear', () => clearRejections())

  // Reset today's local per-model usage counters + log.
  handle('ai:resetUsage', () => {
    resetUsage()
    return true
  })

  handle('app:version', () => app.getVersion())

  // Auto-update placeholder (no network, no telemetry).
  handle('update:check', () => checkForUpdates())

  // Open an official platform page in the system browser (allow-listed).
  handle('shell:open', (url: string) => openExternal(url))

  // Scheduling / status management.
  // Manual scheduler pass (Dashboard "Check now"); returns posts moved to ready.
  handle('scheduler:runNow', () => runSchedulerOnce())
  // Direct status change (validated enum). Used by bulk actions + cancel.
  handle('post:setStatus', (payload: { id: string; status: PostStatus }) =>
    setStatus(payload.id, payload.status)
  )
}
