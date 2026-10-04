import type {
  PostRecord,
  GeneratePostInput,
  GeneratedVariant,
  CarouselSlide,
  CrawlerTopic,
  DailyTopicsOptions,
  AgentReachReport,
  AiStatusReport,
  PostStatus,
  KeyTestResult,
  Platform,
  AccountSource,
  AccountStatus
} from '@shared/types'

export interface GenerateResult {
  variants: GeneratedVariant[]
  slides: CarouselSlide[] | null
  imageUrl: string | null
  textProvider: string
  imageProvider: string | null
}

/** Result of the in-app account login window (never contains a cookie value). */
export interface AccountLoginResult {
  ok: boolean
  handle?: string
  error?: string
}

// Raw key values are only ever sent UP to main on save. The renderer receives
// back just configured/length/last-4 metadata — never the secret characters.
type SettingsPatch = Record<string, string>
type SettingsStatus = Record<string, { configured: boolean; length: number; last4: string }>
export type { SettingsStatus }

// Throws on IPC-level failure so callers can try/catch and show a toast.
async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const res = await window.postly.invoke(channel, payload)
  if (!res.ok) throw new Error(res.error || `IPC ${channel} failed`)
  return res.data as T
}

// Opens an official platform page in the system browser (main allow-lists the
// host). The caption is copied separately — we never auto-fill or store creds.
const COMPOSE_URLS: Record<Platform, (text: string) => string> = {
  // Official web intents that pre-fill the composer from the clipboard-free text.
  x: (t) => `https://x.com/intent/tweet?text=${encodeURIComponent(t)}`,
  threads: (t) => `https://www.threads.net/intent/post?text=${encodeURIComponent(t)}`,
  linkedin: () => 'https://www.linkedin.com/feed/',
  instagram: () => 'https://www.instagram.com/',
  reddit: () => 'https://www.reddit.com/submit'
}

export function buildComposeUrl(platform: Platform, text: string): string {
  return COMPOSE_URLS[platform](text)
}

export const api = {
  // Combined, deduped, relevance+engagement-ranked topics (cached backend-side).
  fetchTopics: (opts?: DailyTopicsOptions) => call<CrawlerTopic[]>('topics:fetch', opts),
  agentReachStatus: (refresh = false) => call<AgentReachReport>('agentreach:status', refresh),
  generate: (input: GeneratePostInput) => call<GenerateResult>('post:generate', input),
  toDraft: (topic: string, variant: GeneratedVariant, imageUrl: string | null, slides: CarouselSlide[] | null) =>
    call<PostRecord>('post:toDraft', { topic, variant, imageUrl, slides }),
  savePost: (record: PostRecord) => call<PostRecord>('post:save', record),
  listPosts: (status?: PostStatus) => call<PostRecord[]>('post:list', status),
  deletePost: (id: string) => call<void>('post:delete', id),
  rejectPost: (record: PostRecord, reason: string | null, notes?: string | null) =>
    call<void>('post:reject', { record, reason, notes: notes ?? null }),
  getSettings: () => call<SettingsStatus>('settings:get'),
  setSettings: (patch: SettingsPatch) => call<SettingsStatus>('settings:set', patch),
  testKey: (key: string) => call<KeyTestResult>('key:test', key),
  // Account-login crawling: open the in-app login window / read live status.
  accountsLogin: (source: AccountSource) => call<AccountLoginResult>('accounts:login', { source }),
  accountsStatus: () => call<AccountStatus[]>('accounts:status'),
  hasDatabase: () => call<boolean>('db:check'),
  aiStatus: () => call<AiStatusReport>('ai:status'),
  resetAiUsage: () => call<boolean>('ai:resetUsage'),
  rejectionCount: () => call<number>('rejections:count'),
  clearRejections: () => call<void>('rejections:clear'),
  runSchedulerNow: () => call<number>('scheduler:runNow'),
  setStatus: (id: string, status: PostStatus) => call<void>('post:setStatus', { id, status }),
  getPrefs: () => call<Record<string, string>>('prefs:all'),
  setPref: (key: string, value: string) => call<void>('prefs:set', { key, value }),
  appVersion: () => call<string>('app:version'),
  checkForUpdates: () => call<{ status: 'not-configured'; message: string }>('update:check'),
  openExternal: (url: string) => call<void>('shell:open', url)
}
