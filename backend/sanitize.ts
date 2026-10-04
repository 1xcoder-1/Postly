import {
  POST_STATUSES,
  POST_STYLES,
  PLATFORMS,
  type PostRecord,
  type PostStatus,
  type PostStyle,
  type Platform,
  type PublicationMap,
  type PlatformStatus,
  type CarouselSlide
} from '../src/shared/types'

// ── Input sanitization at the persistence boundary ─────────────────────────
// Everything that reaches savePost()/recordRejection() has travelled through
// the renderer, the AI providers, or the Python crawlers — none of which we
// fully trust. We never let raw strings hit Postgres (or the JSON fallback)
// unchecked: strip control characters, clamp lengths, and reject enum values
// that aren't in the canonical lists. This is defense-in-depth on top of the
// DB's own enum/column constraints.

// C0/C1 control chars + DEL, but keep \n and \t so multi-line copy survives.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL_CHARS, '').trim().slice(0, max)
}

function nullableText(value: unknown, max: number): string | null {
  const s = text(value, max)
  return s || null
}

// ISO-8601 round-trip, rejecting anything Date can't parse.
function isoOrNull(value: unknown): string | null {
  if (value == null || value === '') return null
  const d = new Date(value as string | number)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function hashtags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const raw of value) {
    let tag = text(raw, 60).replace(/^#*/, '')
    // Keep only letters, numbers, underscores; drop spaces/emoji/punctuation.
    tag = tag.replace(/[^\p{L}\p{N}_]/gu, '')
    if (tag && !out.includes(tag)) out.push(tag)
    if (out.length >= 30) break
  }
  return out
}

function slides(value: unknown): CarouselSlide[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).map((raw, i) => {
    const s = (raw ?? {}) as Partial<CarouselSlide>
    return {
      index: typeof s.index === 'number' ? s.index : i,
      title: text(s.title, 200),
      body: text(s.body, 2000),
      // Per-slide generated image (http/https only, same rule as the hero).
      imageUrl: imageUrl(s.imageUrl)
    }
  })
}

// A URL is only ever stored to be displayed as an image; refuse anything that
// isn't http(s) (blocks javascript:, data:, file: smuggled in via the wire).
function imageUrl(value: unknown): string | null {
  const s = text(value, 500)
  if (!s) return null
  return /^https?:\/\//i.test(s) ? s : null
}

export class ValidationError extends Error {}

function safeStatus(value: unknown): PostStatus {
  if (typeof value === 'string' && (POST_STATUSES as string[]).includes(value)) {
    return value as PostStatus
  }
  throw new ValidationError(`Invalid post status: ${JSON.stringify(value)}`)
}

function safeStyle(value: unknown): PostStyle | null {
  if (value == null || value === '') return null
  if (typeof value === 'string' && (POST_STYLES as string[]).includes(value)) {
    return value as PostStyle
  }
  throw new ValidationError(`Invalid post style: ${JSON.stringify(value)}`)
}

function safePlatforms(value: unknown): Platform[] {
  if (!Array.isArray(value)) return []
  const out: Platform[] = []
  for (const p of value) {
    if (typeof p === 'string' && (PLATFORMS as readonly string[]).includes(p) && !out.includes(p as Platform)) {
      out.push(p as Platform)
    }
  }
  return out
}

const PLATFORM_STATUSES: PlatformStatus[] = ['ready', 'posted']

// Per-platform publishing state. Keys must be real platforms; status must be a
// known value. Entries whose platform isn't in `selected` are dropped so the
// map can never reference a deselected platform.
function publication(value: unknown, selected: Platform[]): PublicationMap {
  if (!value || typeof value !== 'object') return {}
  const src = value as Record<string, unknown>
  const out: PublicationMap = {}
  for (const p of selected) {
    const entry = src[p] as { status?: unknown; postedAt?: unknown } | undefined
    if (!entry) continue
    const status = (PLATFORM_STATUSES as string[]).includes(String(entry.status))
      ? (entry.status as PlatformStatus)
      : 'ready'
    out[p] = { status, postedAt: isoOrNull(entry.postedAt) }
  }
  return out
}

/**
 * Returns a fully sanitized copy of the record, or throws ValidationError if
 * status/style is not one of the accepted enum values. Apply before every DB
 * or JSON write so the stored shape is always trustworthy.
 */
export function sanitizePost(record: PostRecord): PostRecord {
  const id = text(record?.id, 64)
  if (!id) throw new ValidationError('Post id is required')
  const status = safeStatus(record.status)
  const scheduledAt = isoOrNull(record.scheduledAt)
  const postedAt = isoOrNull(record.postedAt)
  const platforms = safePlatforms(record.platforms)

  // Scheduling rules (security): a scheduled post needs a real date that
  // is in the future. The local scheduler moves due posts to 'pending', so a
  // past 'scheduled' date only ever means a bad/manual write — reject it.
  if (status === 'scheduled') {
    if (!scheduledAt) throw new ValidationError('A scheduled post needs a valid date & time')
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      throw new ValidationError('Cannot schedule a post in the past')
    }
  }

  return {
    id,
    topic: text(record.topic, 200),
    title: text(record.title, 300),
    description: text(record.description, 5000),
    hashtags: hashtags(record.hashtags),
    style: safeStyle(record.style),
    platforms,
    publication: publication(record.publication, platforms),
    status,
    isCarousel: Boolean(record.isCarousel),
    slides: slides(record.slides),
    imageUrl: imageUrl(record.imageUrl),
    scheduledAt,
    postedAt,
    rejectionReason: nullableText(record.rejectionReason, 1000),
    isDeleted: Boolean(record.isDeleted),
    createdAt: isoOrNull(record.createdAt) ?? new Date().toISOString(),
    updatedAt: isoOrNull(record.updatedAt) ?? new Date().toISOString()
  }
}

/** Sanitized rejection inputs (reason/notes) for recordRejection(). */
export function sanitizeRejection(
  record: PostRecord,
  reason: string | null,
  notes: string | null
): { record: PostRecord; reason: string | null; notes: string | null } {
  return {
    record: sanitizePost(record),
    reason: nullableText(reason, 1000),
    notes: nullableText(notes, 2000)
  }
}
