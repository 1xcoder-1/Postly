import { and, eq, desc, count } from 'drizzle-orm'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDb } from './client'
import { posts, rejectionFeedback, toPostRecord, type NewPostRow } from './schema'
import { sanitizePost, sanitizeRejection, ValidationError } from '../sanitize'
import { DATA_DIR } from '../paths'
import { POST_STATUSES, type PostRecord, type PostStatus } from '../../src/shared/types'

// ── In-memory + JSON-file fallback store ──────────────────────────────────
// Lets the whole app run before a Neon DATABASE_URL is configured. Drafts and
// rejections persist to ./data/posts.json. Once DATABASE_URL is set, every
// function below uses Postgres instead.

const FALLBACK_PATH = resolve(DATA_DIR, 'posts.json')
let memory: { posts: PostRecord[]; rejections: any[] } | null = null

function loadMemory() {
  if (memory) return memory
  try {
    memory = existsSync(FALLBACK_PATH)
      ? JSON.parse(readFileSync(FALLBACK_PATH, 'utf8'))
      : { posts: [], rejections: [] }
  } catch {
    memory = { posts: [], rejections: [] }
  }
  return memory!
}

function persistMemory(store: { posts: PostRecord[]; rejections: any[] }) {
  mkdirSync(resolve(FALLBACK_PATH, '..'), { recursive: true })
  writeFileSync(FALLBACK_PATH, JSON.stringify(store, null, 2), 'utf8')
}

/** Full-replacement upsert: callers always send the whole record. */
export async function savePost(record: PostRecord): Promise<PostRecord> {
  // Sanitize + validate once, up front, so both the DB and JSON paths write a
  // trustworthy shape. Throws ValidationError on a bad status/style.
  const clean = sanitizePost(record)
  const db = getDb()
  if (!db) {
    const store = loadMemory()
    const idx = store.posts.findIndex((p) => p.id === clean.id)
    if (idx >= 0) store.posts[idx] = clean
    else store.posts.unshift(clean)
    persistMemory(store)
    return clean
  }

  const values: NewPostRow = {
    id: clean.id,
    topic: clean.topic,
    title: clean.title,
    content: clean.description,
    hashtags: clean.hashtags,
    style: clean.style,
    platforms: clean.platforms,
    publication: clean.publication,
    status: clean.status,
    isCarousel: clean.isCarousel,
    slides: clean.slides,
    imageUrls: clean.imageUrl ? [clean.imageUrl] : [],
    scheduledAt: clean.scheduledAt ? new Date(clean.scheduledAt) : null,
    postedAt: clean.postedAt ? new Date(clean.postedAt) : null,
    rejectionReason: clean.rejectionReason,
    isDeleted: clean.isDeleted,
    updatedAt: new Date()
  }

  await db
    .insert(posts)
    .values(values)
    .onConflictDoUpdate({ target: posts.id, set: { ...values, createdAt: undefined } as any })

  return clean
}

export async function listPosts(status?: PostStatus): Promise<PostRecord[]> {
  const db = getDb()
  if (!db) {
    const store = loadMemory()
    const alive = store.posts.filter((p) => !p.isDeleted)
    const sorted = [...alive].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return status ? sorted.filter((p) => p.status === status) : sorted
  }
  const where = status ? and(eq(posts.status, status), eq(posts.isDeleted, false)) : eq(posts.isDeleted, false)
  const rows = await db.select().from(posts).where(where).orderBy(desc(posts.createdAt))
  return rows.map(toPostRecord)
}

/** Soft delete: keep the row for history/AI learning, hide it from the UI. */
export async function deletePost(id: string): Promise<void> {
  const db = getDb()
  if (!db) {
    const store = loadMemory()
    const post = store.posts.find((p) => p.id === id)
    if (post) post.isDeleted = true
    persistMemory(store)
    return
  }
  await db.update(posts).set({ isDeleted: true, updatedAt: new Date() }).where(eq(posts.id, id))
}

/** Records a rejection as a negative example for future generations. */
export async function recordRejection(
  rawRecord: PostRecord,
  reason: string | null,
  notes: string | null = null
): Promise<void> {
  const { record, reason: cleanReason, notes: cleanNotes } = sanitizeRejection(
    rawRecord,
    reason,
    notes
  )
  const db = getDb()
  if (!db) {
    const store = loadMemory()
    store.rejections.unshift({
      topic: record.topic,
      rejectedTitle: record.title,
      rejectedDescription: record.description,
      reason: cleanReason,
      notes: cleanNotes,
      createdAt: new Date().toISOString()
    })
    const post = store.posts.find((p) => p.id === record.id)
    if (post) {
      post.status = 'rejected'
      post.rejectionReason = cleanReason
    }
    persistMemory(store)
    return
  }
  await db.insert(rejectionFeedback).values({
    postId: record.id,
    topic: record.topic,
    rejectedTitle: record.title,
    rejectedContent: record.description,
    hashtags: record.hashtags,
    reason: cleanReason,
    notes: cleanNotes
  })
  await db
    .update(posts)
    .set({ status: 'rejected', rejectionReason: cleanReason, updatedAt: new Date() })
    .where(eq(posts.id, record.id))
}

/** Recent rejections for the same topic, used as negative examples in prompts. */
export async function recentRejections(topic: string, limit = 5): Promise<
  { rejectedTitle: string; rejectedDescription: string; reason: string | null }[]
> {
  const db = getDb()
  if (!db) {
    return loadMemory()
      .rejections.filter((r: { topic: string }) => r.topic === topic)
      .slice(0, limit)
  }
  const rows = await db
    .select()
    .from(rejectionFeedback)
    .where(eq(rejectionFeedback.topic, topic))
    .orderBy(desc(rejectionFeedback.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    rejectedTitle: r.rejectedTitle,
    rejectedDescription: r.rejectedContent,
    reason: r.reason
  }))
}

/** Total stored rejections (for the Settings "clear history" UI). */
export async function countRejections(): Promise<number> {
  const db = getDb()
  if (!db) return loadMemory().rejections.length
  const rows = await db.select({ n: count() }).from(rejectionFeedback)
  return rows[0]?.n ?? 0
}

/** Deletes every rejection example. Irreversible — surfaced behind a confirm. */
export async function clearRejections(): Promise<void> {
  const db = getDb()
  if (!db) {
    const store = loadMemory()
    store.rejections = []
    persistMemory(store)
    return
  }
  await db.delete(rejectionFeedback)
}

/** Change only a post's status (validated against the canonical enum). Used by
 *  the scheduler and bulk actions, where we don't want to rewrite the record. */
export async function setStatus(id: string, status: PostStatus): Promise<void> {
  if (!(POST_STATUSES as string[]).includes(status)) {
    throw new ValidationError(`Invalid post status: ${JSON.stringify(status)}`)
  }
  const db = getDb()
  if (!db) {
    const store = loadMemory()
    const post = store.posts.find((p) => p.id === id)
    if (post) {
      post.status = status
      post.updatedAt = new Date().toISOString()
      persistMemory(store)
    }
    return
  }
  await db.update(posts).set({ status, updatedAt: new Date() }).where(eq(posts.id, id))
}

/** Scheduler worker: flip every scheduled post whose time has arrived to
 *  'pending' (ready to publish). Returns how many posts it moved. */
export async function markDueScheduledReady(now = Date.now()): Promise<number> {
  const due = (await listPosts('scheduled')).filter(
    (p) => p.scheduledAt && new Date(p.scheduledAt).getTime() <= now
  )
  for (const p of due) await setStatus(p.id, 'pending')
  return due.length
}
