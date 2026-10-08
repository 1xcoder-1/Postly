import { and, eq, desc, lte } from 'drizzle-orm'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDb } from './client'
import { posts, toPostRecord, type NewPostRow } from './schema'
import { sanitizePost, ValidationError } from '../sanitize'
import { DATA_DIR } from '../paths'
import { POST_STATUSES, type PostRecord, type PostStatus } from '../../src/shared/types'

// ── In-memory + JSON-file fallback store ──────────────────────────────────
// Lets the whole app run before a Neon DATABASE_URL is configured. Drafts
// persist to ./data/posts.json. Once DATABASE_URL is set, every function
// below uses Postgres instead. The legacy `rejections` array is still read
// from the JSON file so older stores parse cleanly, but nothing writes it.

const FALLBACK_PATH = resolve(DATA_DIR, 'posts.json')
let memory: { posts: PostRecord[]; rejections: any[] } | null = null

function loadMemory() {
  if (memory) return memory
  try {
    memory = existsSync(FALLBACK_PATH)
      ? JSON.parse(readFileSync(FALLBACK_PATH, 'utf8'))
      : { posts: [], rejections: [] }
  } catch (e) {
    // A corrupt/unreadable posts.json used to reset silently to empty, so every
    // local draft vanished from the UI with nothing in the log to explain it.
    console.error('[db] posts.json unreadable — starting with an empty local store', {
      error: (e as Error).message
    })
    memory = { posts: [], rejections: [] }
  }
  return memory!
}

function persistMemory(store: { posts: PostRecord[]; rejections: any[] }) {
  mkdirSync(resolve(FALLBACK_PATH, '..'), { recursive: true })
  writeFileSync(FALLBACK_PATH, JSON.stringify(store, null, 2), 'utf8')
}

/** Full-replacement upsert: callers always send the whole record.
 *  `userId` comes from the verified session in main — every row is owned. */
export async function savePost(record: PostRecord, userId: string): Promise<PostRecord> {
  // Sanitize + validate once, up front, so both the DB and JSON paths write a
  // trustworthy shape. Throws ValidationError on a bad status/style.
  const clean = { ...sanitizePost(record), userId }
  const db = getDb()
  if (!db) {
    const store = loadMemory()
    const idx = store.posts.findIndex((p) => p.id === clean.id)
    if (idx >= 0) {
      // Never let one account overwrite another account's post.
      if (store.posts[idx].userId && store.posts[idx].userId !== userId) {
        throw new Error('Post belongs to a different account')
      }
      store.posts[idx] = clean
    } else {
      store.posts.unshift(clean)
    }
    persistMemory(store)
    return clean
  }

  const values: NewPostRow = {
    id: clean.id,
    userId,
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
    .onConflictDoUpdate({
      target: posts.id,
      // The WHERE keeps the update restricted to rows this user owns; someone
      // guessing another account's post id gets a silent no-op instead.
      set: { ...values, createdAt: undefined } as any,
      where: and(eq(posts.id, clean.id), eq(posts.userId, userId))
    })

  return clean
}

export async function listPosts(userId: string, status?: PostStatus): Promise<PostRecord[]> {
  const db = getDb()
  if (!db) {
    const store = loadMemory()
    const alive = store.posts.filter((p) => !p.isDeleted && p.userId === userId)
    const sorted = [...alive].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return status ? sorted.filter((p) => p.status === status) : sorted
  }
  const owned = eq(posts.userId, userId)
  const where = status ? and(owned, eq(posts.status, status), eq(posts.isDeleted, false)) : and(owned, eq(posts.isDeleted, false))
  const rows = await db.select().from(posts).where(where).orderBy(desc(posts.createdAt))
  return rows.map(toPostRecord)
}

/** Soft delete: keep the row for history/AI learning, hide it from the UI.
 *  Restricted to rows owned by `userId`. */
export async function deletePost(userId: string, id: string): Promise<void> {
  const db = getDb()
  if (!db) {
    const store = loadMemory()
    const post = store.posts.find((p) => p.id === id && p.userId === userId)
    if (post) post.isDeleted = true
    persistMemory(store)
    return
  }
  await db
    .update(posts)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(and(eq(posts.id, id), eq(posts.userId, userId)))
}

/** Change only a post's status (validated against the canonical enum). Used by
 *  the scheduler and bulk actions, where we don't want to rewrite the record.
 *  With a userId the write is restricted to that owner's rows; the background
 *  scheduler passes null and flips due posts across all accounts. */
export async function setStatus(id: string, status: PostStatus, userId: string | null = null): Promise<void> {
  if (!(POST_STATUSES as string[]).includes(status)) {
    throw new ValidationError(`Invalid post status: ${JSON.stringify(status)}`)
  }
  const db = getDb()
  if (!db) {
    const store = loadMemory()
    const post = store.posts.find((p) => p.id === id && (!userId || p.userId === userId))
    if (post) {
      post.status = status
      post.updatedAt = new Date().toISOString()
      persistMemory(store)
    }
    return
  }
  const where = userId ? and(eq(posts.id, id), eq(posts.userId, userId)) : eq(posts.id, id)
  await db.update(posts).set({ status, updatedAt: new Date() }).where(where)
}

/** Scheduler worker: flip every scheduled post whose time has arrived to
 *  'pending' (ready to publish). Runs across all accounts (system job, not
 *  tied to a session). Returns how many posts it moved. */
export async function markDueScheduledReady(now = Date.now()): Promise<number> {
  const db = getDb()
  if (!db) {
    const store = loadMemory()
    const due = store.posts.filter(
      (p) => !p.isDeleted && p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt).getTime() <= now
    )
    for (const p of due) await setStatus(p.id, 'pending', p.userId)
    return due.length
  }
  const due = await db
    .select({ id: posts.id, userId: posts.userId })
    .from(posts)
    .where(
      and(
        eq(posts.status, 'scheduled'),
        eq(posts.isDeleted, false),
        lte(posts.scheduledAt, new Date(now))
      )
    )
  for (const p of due) await setStatus(p.id, 'pending', p.userId)
  return due.length
}
