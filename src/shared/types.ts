// Shared types used by main, preload and renderer processes.

export type PostStatus =
  | 'draft'
  | 'pending'
  | 'scheduled'
  | 'posted'
  | 'rejected'
  | 'failed'
export type PostStyle = 'educational' | 'story' | 'hot-take'

// Canonical lists for runtime validation (status/platform/style guards).
export const POST_STATUSES: PostStatus[] = [
  'draft',
  'pending',
  'scheduled',
  'posted',
  'rejected',
  'failed'
]
export const POST_STYLES: PostStyle[] = ['educational', 'story', 'hot-take']

// Voice applied on top of the 3 content styles.
export type Tone = 'professional' | 'casual' | 'bold'
export const TONES: Tone[] = ['professional', 'casual', 'bold']

// Visual style for AI-generated images (single IG post + carousel). These map
// to curated prompt presets in backend/ai/prompts.ts that deliberately avoid the
// oversaturated "AI slop" look and bake in NO text (text stays in the caption).
export type ImageStyleId =
  | 'editorial-photo'
  | 'cinematic'
  | 'documentary'
  | 'product-natural'
  | 'film-portrait'
  | 'swiss-poster'
  | 'riso-print'
  | 'flat-vector'
  | 'muted-brand'
export const IMAGE_STYLES: ImageStyleId[] = [
  'editorial-photo',
  'cinematic',
  'documentary',
  'product-natural',
  'film-portrait',
  'swiss-poster',
  'riso-print',
  'flat-vector',
  'muted-brand'
]

export const PLATFORMS = ['x', 'linkedin', 'instagram', 'threads', 'reddit'] as const
export type Platform = (typeof PLATFORMS)[number]

// ── Account-login crawling (X / LinkedIn / Reddit personal accounts) ─────────
// A user connects their own account either through an in-app login window or by
// pasting cookies; the resulting cookie secrets are stored encrypted and flow to
// the Python crawlers via process.env. These types carry NON-secret status only
// (configured/connected flags, resolved handle, human message) to the renderer.
export type AccountSource = 'x' | 'linkedin' | 'reddit' | 'github'
export const ACCOUNT_SOURCES: AccountSource[] = ['x', 'linkedin', 'reddit', 'github']

export interface AccountStatus {
  source: AccountSource
  /** True when the required cookie secret(s) for this source are stored. */
  configured: boolean
  /** True when a live identity probe with those cookies succeeded. */
  connected: boolean
  /** Resolved identity from the probe (screen name / public name). Never a secret. */
  handle?: string
  /** Human status: 'Not connected' | 'Connected as @handle' | 'expired or invalid' text. */
  message?: string
}

// Per-platform publishing progress for a single post (manual posting flow).
export type PlatformStatus = 'ready' | 'posted'
export interface PlatformPublication {
  status: PlatformStatus
  postedAt: string | null
}
export type PublicationMap = Partial<Record<Platform, PlatformPublication>>

// Machine-readable reasons the user picks when rejecting a post. Stored in the
// rejection_feedback table and fed back to the AI as negative examples, so
// these stay stable strings (labels are for the UI only).
export const REJECTION_REASONS = [
  'off-topic',
  'wrong-fact',
  'too-long',
  'bad-tone',
  'clickbait',
  'generic',
  'duplicate',
  'other'
] as const
export type RejectionReason = (typeof REJECTION_REASONS)[number]

/** Result of a lightweight "does this key work?" check (never the key itself). */
export interface KeyTestResult {
  key: string
  ok: boolean
  /** Human status: 'Working' | 'Invalid' | 'Not set' | network error text. */
  message: string
}

export interface CarouselSlide {
  index: number
  title: string
  body: string
  /** Per-slide AI image (chosen style, text-free). Best-effort: may be null. */
  imageUrl?: string | null
}

export interface GeneratedVariant {
  style: PostStyle
  title: string
  description: string
  hashtags: string[]
}

export interface PostRecord {
  id: string
  topic: string
  title: string
  description: string
  hashtags: string[]
  style: PostStyle | null
  platforms: Platform[]
  publication: PublicationMap
  status: PostStatus
  isCarousel: boolean
  slides: CarouselSlide[]
  imageUrl: string | null
  scheduledAt: string | null
  postedAt: string | null
  rejectionReason: string | null
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export interface GeneratePostInput {
  topic: string
  /** When true, also produce carousel slide copy. */
  carousel: boolean
  slidesCount?: number
  /** Voice applied to all variants. Defaults to 'casual'. */
  tone?: Tone
  /** Force a specific provider instead of the automatic fallback chain. */
  forceTextModel?: string
  forceImageModel?: string
  /** Visual style preset for generated images. Defaults to 'editorial-photo'. */
  imageStyle?: ImageStyleId
}

// ── AI usage / status (surface the multi-model router to the UI) ────────────
export interface ModelUsage {
  provider: string
  kind: 'text' | 'image'
  /** Provider label shown in the UI. */
  label: string
  hasKey: boolean
  callsToday: number
  dailyCap: number
  /** True when out of daily cap or cooling down from repeated failures. */
  available: boolean
  coolingDown: boolean
}

export interface GenerationLogEntry {
  at: string
  kind: 'text' | 'image'
  provider: string
  outcome: 'used' | 'error' | 'timeout' | 'quota' | 'skipped'
  detail?: string
}

export interface AiStatusReport {
  models: ModelUsage[]
  recent: GenerationLogEntry[]
}

export interface CrawlerTopic {
  title: string
  source: string
  url: string | null
  score: number | null
}

/** Options for the combined getDailyTopics() feed (relevance + engagement). */
export interface DailyTopicsOptions {
  subreddits?: string
  minEngagement?: number
  highEngagementOnly?: boolean
  /** Bypass the cache and re-crawl now, so every click yields fresh suggestions. */
  refresh?: boolean
}

/** One `agent-reach doctor` channel row, compacted by the Python crawler. */
export interface AgentReachChannel {
  status: 'ok' | 'warn' | 'off' | string
  message: string
  active_backend: string | null
}

export interface AgentReachReport {
  status: Record<string, AgentReachChannel>
  topics: CrawlerTopic[]
}
