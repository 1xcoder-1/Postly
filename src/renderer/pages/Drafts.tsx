import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Check, PenLine, Inbox, CalendarClock, CalendarX2, Copy, Search, FileQuestion, CheckCheck } from 'lucide-react'
import type { PostRecord, Platform } from '@shared/types'
import { PLATFORMS } from '@shared/types'
import { usePosts } from '@/renderer/store'
import { Card, CardContent, CardHeader } from '@/renderer/components/ui/card'
import { Button } from '@/renderer/components/ui/button'
import { Input, Textarea, Label, Select } from '@/renderer/components/ui/input'
// Page title now lives in the top navbar — PageHeader no longer needed here.
import { EmptyState } from '@/renderer/components/ui/EmptyState'
import { Segmented } from '@/renderer/components/ui/Segmented'
import { ErrorBanner } from '@/renderer/components/ErrorBanner'
import { StatusBadge, Hashtags } from '@/renderer/components/PostBits'

const dateTimeInputClass =
  'h-9 rounded-[8px] border border-input bg-zinc-800/40 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary/50'

export default function Drafts() {
  const { posts, save, remove, setStatus, setPlatforms, duplicate, load, error } = usePosts()
  const [editing, setEditing] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState('active')
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState<Platform>(PLATFORMS[0])
  const [sort, setSort] = useState<'new' | 'old'>('new')

  const active = posts.filter((p) => p.status === 'draft' || p.status === 'pending' || p.status === 'scheduled')
  const done = posts.filter((p) => p.status === 'posted')

  // Search (title/description/topic), platform filter, and date sort applied to
  // whichever tab is showing.
  const list = useMemo(() => {
    const base = (tab === 'active' ? active : done).filter((p) => {
      if (!p.platforms.includes(platform)) return false
      const q = query.trim().toLowerCase()
      if (q && !(`${p.title} ${p.description} ${p.topic}`.toLowerCase().includes(q))) return false
      return true
    })
    const dir = sort === 'new' ? -1 : 1
    return base.sort((a, b) => dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))
  }, [tab, active, done, platform, query, sort])

  // The platform picker is a mandatory per-platform view (no "All platforms"
  // option — removed by design), so only the search box is a clearable filter.
  const filtersOn = query.trim() !== ''

  // Save that surfaces server-side validation (e.g. past schedule) as a toast.
  async function update(next: PostRecord) {
    try {
      await save({ ...next, updatedAt: new Date().toISOString() })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function togglePlatform(p: PostRecord, platform: Platform) {
    const has = p.platforms.includes(platform)
    const next = has ? p.platforms.filter((x) => x !== platform) : [...p.platforms, platform]
    setPlatforms(p.id, next).catch((e) => toast.error((e as Error).message))
  }

  // Set a future date → scheduled; clear it → back to draft (cancel schedule).
  function reschedule(p: PostRecord, value: string) {
    update({
      ...p,
      scheduledAt: value ? new Date(value).toISOString() : null,
      status: value ? 'scheduled' : 'draft'
    })
  }

  async function cancelSchedule(p: PostRecord) {
    await update({ ...p, scheduledAt: null, status: 'draft' })
    toast.success('Schedule cancelled — back to draft')
  }

  // Manual bookkeeping: the app never posts anywhere — you mark it done yourself.
  async function markDone(p: PostRecord) {
    await update({ ...p, status: 'posted', scheduledAt: null, postedAt: new Date().toISOString() })
    toast.success('Marked done')
  }

  async function onDuplicate(p: PostRecord) {
    try {
      await duplicate(p)
      toast.success('Duplicated as a new draft')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkStatus(status: 'pending') {
    const ids = [...selected]
    try {
      for (const id of ids) await setStatus(id, status)
      toast.success(`${ids.length} marked ready`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSelected(new Set())
    }
  }

  async function bulkDelete() {
    const ids = [...selected]
    if (!window.confirm(`Delete ${ids.length} post(s)?`)) return
    try {
      for (const id of ids) await remove(id)
      toast.success(`${ids.length} deleted`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSelected(new Set())
    }
  }

  return (
    <div>
      {/* Tab switcher only — title and description removed in favor of the navbar */}
      <div className="mb-6 flex items-center justify-end">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'active', label: 'Active', count: active.length },
            { value: 'done', label: 'Done', count: done.length }
          ]}
        />
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* Search + platform filter + date sort */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, content or topic…"
            className="pl-9"
            aria-label="Search drafts"
          />
        </div>
        <Select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform)}
          className="w-full sm:w-40"
          aria-label="Filter by platform"
        >
          {PLATFORMS.map((pl) => (
            <option key={pl} value={pl} className="capitalize">
              {pl}
            </option>
          ))}
        </Select>
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as 'new' | 'old')}
          className="w-full sm:w-44"
          aria-label="Sort by date"
        >
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border bg-card px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkStatus('pending')}>
            <Check /> Mark ready
          </Button>
          <Button size="sm" variant="destructive" onClick={bulkDelete}>
            <Trash2 /> Delete
          </Button>
          <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {list.length === 0 ? (
        filtersOn ? (
          <EmptyState
            icon={<FileQuestion />}
            title="No matches"
            description="No posts match your search or filters."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => setQuery('')}
              >
                Clear search
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={tab === 'active' ? <Inbox /> : <CheckCheck />}
            title={tab === 'active' ? 'Nothing in progress' : 'Nothing done yet'}
            description={tab === 'active' ? 'Write a post to fill your pipeline.' : 'Mark a draft done and it will show up here.'}
          />
        )
      ) : (
        <div className="space-y-4">
          {list.map((p) => {
            const open = editing === p.id
            return (
              <Card key={p.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      aria-label="Select post"
                      className="accent-primary"
                    />
                    <StatusBadge status={p.status} />
                    <span className="text-xs text-muted-foreground">{p.topic}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(open ? null : p.id)}>
                    <PenLine /> {open ? 'Done' : 'Edit'}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {open ? (
                    <>
                      <div>
                        <Label>Title</Label>
                        <Input value={p.title} onChange={(e) => update({ ...p, title: e.target.value })} />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea value={p.description} onChange={(e) => update({ ...p, description: e.target.value })} />
                      </div>
                      <div>
                        <Label>Schedule (future date marks it scheduled)</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="datetime-local"
                            className={dateTimeInputClass}
                            value={p.scheduledAt ? p.scheduledAt.slice(0, 16) : ''}
                            onChange={(e) => reschedule(p, e.target.value)}
                          />
                          {p.scheduledAt && (
                            <Button size="sm" variant="ghost" onClick={() => cancelSchedule(p)}>
                              <CalendarX2 /> Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="font-medium">{p.title}</h3>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</p>
                      <Hashtags hashtags={p.hashtags} />
                      {p.scheduledAt && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                            <CalendarClock className="h-3.5 w-3.5" /> {new Date(p.scheduledAt).toLocaleString()}
                          </span>
                          <span className="text-xs text-muted-foreground">· quick reschedule:</span>
                          <input
                            type="datetime-local"
                            className={dateTimeInputClass}
                            value={p.scheduledAt.slice(0, 16)}
                            onChange={(e) => reschedule(p, e.target.value)}
                          />
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((pl) => (
                      <button
                        key={pl}
                        onClick={() => togglePlatform(p, pl)}
                        className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
                          p.platforms.includes(pl) ? 'border-primary bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {pl}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {p.status !== 'posted' && (
                      <Button size="sm" onClick={() => markDone(p)}>
                        <CheckCheck /> Mark done
                      </Button>
                    )}
                    {p.status === 'scheduled' && (
                      <Button size="sm" variant="outline" onClick={() => cancelSchedule(p)}>
                        <CalendarX2 /> Cancel schedule
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onDuplicate(p)}>
                      <Copy /> Duplicate
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                      <Trash2 /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
