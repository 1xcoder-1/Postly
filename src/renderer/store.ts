import { create } from 'zustand'
import type { PostRecord, PostStatus, Platform, PublicationMap } from '@shared/types'
import { api } from './lib/api'

interface PostsState {
  posts: PostRecord[]
  loading: boolean
  error: string | null
  load: () => Promise<void>
  save: (record: PostRecord) => Promise<void>
  remove: (id: string) => Promise<void>
  setStatus: (id: string, status: PostStatus) => Promise<void>
  setPlatforms: (id: string, platforms: Platform[]) => Promise<void>
  duplicate: (record: PostRecord) => Promise<PostRecord>
}

export const usePosts = create<PostsState>((set, get) => ({
  posts: [],
  loading: false,
  error: null,

  async load() {
    set({ loading: true, error: null })
    try {
      set({ posts: await api.listPosts() })
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  async save(record) {
    const saved = await api.savePost(record)
    const posts = get().posts
    const idx = posts.findIndex((p) => p.id === saved.id)
    if (idx >= 0) posts[idx] = saved
    else posts.unshift(saved)
    set({ posts: [...posts] })
  },

  async remove(id) {
    await api.deletePost(id)
    set({ posts: get().posts.filter((p) => p.id !== id) })
  },

  async setStatus(id, status) {
    await api.setStatus(id, status)
    set({
      posts: get().posts.map((p) =>
        p.id === id
          ? {
              ...p,
              status,
              // Leaving 'scheduled' clears the time; entering posted stamps it.
              scheduledAt: status === 'scheduled' ? p.scheduledAt : null,
              postedAt: status === 'posted' ? new Date().toISOString() : p.postedAt,
              updatedAt: new Date().toISOString()
            }
          : p
      )
    })
  },

  // Change a post's selected platforms and keep `publication` in sync: newly
  // selected platforms start 'ready', deselected ones are dropped.
  async setPlatforms(id, platforms) {
    const current = get().posts.find((p) => p.id === id)
    if (!current) return
    const publication: PublicationMap = {}
    for (const pl of platforms) {
      publication[pl] = current.publication[pl] ?? { status: 'ready', postedAt: null }
    }
    await get().save({ ...current, platforms, publication, updatedAt: new Date().toISOString() })
  },

  // Clone a post into a fresh draft (new id, cleared schedule state).
  async duplicate(record) {
    const iso = new Date().toISOString()
    const copy: PostRecord = {
      ...record,
      id: crypto.randomUUID(),
      title: `${record.title} (copy)`,
      status: 'draft',
      scheduledAt: null,
      postedAt: null,
      rejectionReason: null,
      isDeleted: false,
      createdAt: iso,
      updatedAt: iso
    }
    await get().save(copy)
    return copy
  }
}))

