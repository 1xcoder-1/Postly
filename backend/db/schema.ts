import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  uuid,
  index,
  unique
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { PostRecord } from '../../src/shared/types'

// ── posts ──────────────────────────────────────────────────────────────────
// DB columns: content, image_urls, posted_at, rejection_reason, is_deleted.
// The app-facing PostRecord keeps `description` and a single `imageUrl`; the
// mappers below bridge the two shapes.
export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: text('topic').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(), // PostRecord.description
    hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
    style: text('style', { enum: ['educational', 'story', 'hot-take'] }),
    platforms: jsonb('platforms').$type<PostRecord['platforms']>().notNull().default([]),
    publication: jsonb('publication').$type<PostRecord['publication']>().notNull().default({}),
    status: text('status', {
      enum: ['draft', 'pending', 'scheduled', 'posted', 'rejected', 'failed']
    })
      .notNull()
      .default('draft'),
    isCarousel: boolean('is_carousel').notNull().default(false),
    slides: jsonb('slides').$type<PostRecord['slides']>().notNull().default([]),
    imageUrls: jsonb('image_urls').$type<string[]>().notNull().default([]), // [PostRecord.imageUrl]
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    isDeleted: boolean('is_deleted').notNull().default(false), // soft delete
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index('posts_status_idx').on(t.status),
    index('posts_created_at_idx').on(t.createdAt),
    index('posts_scheduled_at_idx').on(t.scheduledAt)
  ]
)

// ── rejection_feedback ─────────────────────────────────────────────────────
// Negative examples the AI reads so future generations avoid these mistakes.
export const rejectionFeedback = pgTable(
  'rejection_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id').references(() => posts.id, { onDelete: 'set null' }),
    topic: text('topic').notNull(),
    rejectedTitle: text('rejected_title').notNull(),
    rejectedContent: text('rejected_content').notNull(),
    hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
    reason: text('reason'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index('rejection_topic_idx').on(t.topic)]
)

// ── settings ───────────────────────────────────────────────────────────────
// Non-secret app preferences (default platforms, theme, etc.) as key/value.
// API keys/DB URL are NEVER stored here — those live in safeStorage + .env.
export const settings = pgTable(
  'settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    value: text('value'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [unique('settings_key_unique').on(t.key)]
)

export type PostRow = typeof posts.$inferSelect
export type NewPostRow = typeof posts.$inferInsert
export type RejectionRow = typeof rejectionFeedback.$inferSelect
export type NewRejectionRow = typeof rejectionFeedback.$inferInsert
export type SettingRow = typeof settings.$inferSelect

// Bridge a DB row to the app PostRecord.
export function toPostRecord(row: PostRow): PostRecord {
  return {
    id: row.id,
    topic: row.topic,
    title: row.title,
    description: row.content,
    hashtags: row.hashtags ?? [],
    style: row.style,
    platforms: row.platforms,
    publication: row.publication ?? {},
    status: row.status,
    isCarousel: row.isCarousel,
    slides: row.slides ?? [],
    imageUrl: row.imageUrls?.[0] ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    postedAt: row.postedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    isDeleted: row.isDeleted,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }
}

export const nowSql = sql`now()`
