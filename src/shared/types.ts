// Shared types used by main, preload and renderer processes.

export type PostStatus =
  | 'draft'
  | 'pending'
  | 'scheduled'
  | 'posted'
  | 'rejected'
  | 'failed'
export type PostStyle = 'educational' | 'story' | 'hot-take'

// Canonical lists for runtime validation (status/style guards). The enum
// values stay stable because old rows may still carry them; the UI only ever
// writes draft / pending / scheduled / posted.
export const POST_STATUSES: PostStatus[] = [
  'draft',
  'pending',
  'scheduled',
  'posted',
  'rejected',
  'failed'
]
export const POST_STYLES: PostStyle[] = ['educational', 'story', 'hot-take']

export const PLATFORMS = ['x', 'linkedin', 'instagram', 'threads', 'reddit'] as const
export type Platform = (typeof PLATFORMS)[number]

// Per-platform bookkeeping for the manual flow ("ready" / "done"). The app
// never publishes anything itself — these are the user's own markers.
export type PlatformStatus = 'ready' | 'posted'
export interface PlatformPublication {
  status: PlatformStatus
  postedAt: string | null
}
export type PublicationMap = Partial<Record<Platform, PlatformPublication>>

export interface CarouselSlide {
  index: number
  title: string
  body: string
  imageUrl?: string | null
}

export interface PostRecord {
  id: string
  /** Local device id that owns this post. Set by the main process — the
   *  renderer never supplies it. */
  userId?: string
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

// ── Agent Reach crawler internals (used by crawlerService only) ───────────
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

/** Gemini's answer to "what should the image for this topic look like?":
 *  a visual description plus copy-ready image-generation prompts. */
export interface ImageBrief {
  topic: string
  visualDescription: string
  prompts: string[]
}

