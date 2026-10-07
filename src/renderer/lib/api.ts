import type { PostRecord, CrawlerTopic, DailyTopicsOptions, PostStatus, ImageBrief } from '@shared/types'

// Throws on IPC-level failure so callers can try/catch and show a toast.
async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const res = await window.postly.invoke(channel, payload)
  if (!res.ok) throw new Error(res.error || `IPC ${channel} failed`)
  return res.data as T
}

export const api = {
  // Combined, deduped, relevance+engagement-ranked topics (cached backend-side).
  fetchTopics: (opts?: DailyTopicsOptions) => call<CrawlerTopic[]>('topics:fetch', opts),
  // Gemini: what the image for this topic should look like + copy-ready prompts.
  imageBrief: (topic: string) => call<ImageBrief>('topic:imageBrief', topic),
  savePost: (record: PostRecord) => call<PostRecord>('post:save', record),
  listPosts: (status?: PostStatus) => call<PostRecord[]>('post:list', status),
  deletePost: (id: string) => call<void>('post:delete', id),
  setStatus: (id: string, status: PostStatus) => call<void>('post:setStatus', { id, status }),
  runSchedulerNow: () => call<number>('scheduler:runNow'),
  hasDatabase: () => call<boolean>('db:check'),
  appVersion: () => call<string>('app:version'),
  // Open a topic's original page in the system browser (main allow-lists the
  // protocol). The app never posts anywhere — this is read-only browsing.
  openExternal: (url: string) => call<void>('shell:open', url)
}
