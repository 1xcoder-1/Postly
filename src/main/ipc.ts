import { ipcMain, app, shell } from 'electron'
import { getDailyTopics } from '../../backend/services/crawlerService'
import { generateImageBrief } from '../../backend/ai/gemini'
import { runSchedulerOnce } from '../../backend/services/scheduler'
import { savePost, listPosts, deletePost, setStatus } from '../../backend/db/postStore'
import { initSettings, hasDatabase } from '../../backend/services/settingsService'
import { requireUserId } from '../../backend/services/auth'
import type { PostRecord, DailyTopicsOptions, PostStatus } from '../shared/types'

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
  shell.openExternal(parsed.toString())
}

export function registerIpc(): void {
  initSettings()

  handle('topics:fetch', (opts?: DailyTopicsOptions) => getDailyTopics(opts ?? {}))

  // Gemini image brief: text-only advice about the visual for a topic.
  handle('topic:imageBrief', (topic: string) => generateImageBrief(topic))

  handle('post:save', (record: PostRecord) => savePost(record, requireUserId()))
  handle('post:list', (status?: string) => listPosts(requireUserId(), status as PostStatus | undefined))
  handle('post:delete', (id: string) => deletePost(requireUserId(), id))

  handle('db:check', () => hasDatabase())

  // Scheduling / status management.
  // Manual scheduler pass ("Check now"); returns posts moved to ready.
  handle('scheduler:runNow', () => runSchedulerOnce())
  // Direct status change (validated enum). Used by bulk actions + cancel.
  handle('post:setStatus', (payload: { id: string; status: PostStatus }) =>
    setStatus(payload.id, payload.status, requireUserId())
  )

  handle('app:version', () => app.getVersion())

  // Open a topic's original page in the system browser (allow-listed).
  handle('shell:open', (url: string) => openExternal(url))
}
