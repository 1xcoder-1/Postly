import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, Check, Save } from 'lucide-react'
import { toast } from 'sonner'
import { PLATFORMS, type Platform, type PostRecord } from '@shared/types'
import { usePosts } from '@/renderer/store'
import { cn } from '@/renderer/lib/utils'
import { Button } from '@/renderer/components/ui/button'
import { Input, Textarea, Label } from '@/renderer/components/ui/input'
import { PLATFORM_LABEL, PostPreview } from '@/renderer/components/PostPreview'

// Working draft is autosaved so a accidental navigation never loses text.
const WORK_KEY = 'scout.write.working'

interface WorkingState {
  topic: string
  title: string
  description: string
  hashtags: string
  platforms: Platform[]
  scheduledAt: string
}

const EMPTY: WorkingState = {
  topic: '',
  title: '',
  description: '',
  hashtags: '',
  platforms: [],
  scheduledAt: ''
}

function loadWorking(): WorkingState {
  try {
    const raw = localStorage.getItem(WORK_KEY)
    if (!raw) return EMPTY
    return { ...EMPTY, ...JSON.parse(raw) }
  } catch {
    return EMPTY
  }
}

export default function WritePost() {
  const save = usePosts((s) => s.save)
  const [params] = useSearchParams()
  const [form, setForm] = useState<WorkingState>(loadWorking)
  const [previewPlatform, setPreviewPlatform] = useState<Platform>('x')
  const [saving, setSaving] = useState(false)

  // Topic Radar's "Write this post" arrives with ?topic=… — pre-fill it.
  useEffect(() => {
    const topic = params.get('topic')
    if (topic) setForm((f) => (f.topic === topic ? f : { ...f, topic }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(WORK_KEY, JSON.stringify(form)), 400)
    return () => clearTimeout(t)
  }, [form])

  const set = <K extends keyof WorkingState>(key: K, value: WorkingState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const tagList = useMemo(
    () =>
      form.hashtags
        .split(/[\s,]+/)
        .map((h) => h.replace(/^#/, '').trim())
        .filter(Boolean),
    [form.hashtags]
  )

  const togglePlatform = (p: Platform) =>
    set('platforms', form.platforms.includes(p) ? form.platforms.filter((x) => x !== p) : [...form.platforms, p])

  async function savePost(): Promise<void> {
    if (!form.title.trim() && !form.description.trim()) {
      toast.error('Write a title or description first')
      return
    }
    setSaving(true)
    try {
      const iso = new Date().toISOString()
      const scheduledAt = form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null
      const record: PostRecord = {
        id: crypto.randomUUID(),
        topic: form.topic.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        hashtags: tagList,
        style: null,
        platforms: form.platforms,
        publication: {},
        status: scheduledAt ? 'scheduled' : 'draft',
        isCarousel: false,
        slides: [],
        imageUrl: null,
        scheduledAt,
        postedAt: null,
        rejectionReason: null,
        isDeleted: false,
        createdAt: iso,
        updatedAt: iso
      }
      await save(record)
      localStorage.removeItem(WORK_KEY)
      setForm(EMPTY)
      toast.success(scheduledAt ? 'Draft saved and scheduled' : 'Draft saved')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in fade-in duration-200">
      {/* Actions row — right-aligned like the other pages */}
      <div className="flex items-center justify-end gap-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setForm(EMPTY)
            localStorage.removeItem(WORK_KEY)
          }}
        >
          Clear
        </Button>
        <Button size="sm" onClick={savePost} disabled={saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save as Draft'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Fields sit directly on the page — no wrapping card */}
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="wp-topic">Topic</Label>
            <Input
              id="wp-topic"
              value={form.topic}
              onChange={(e) => set('topic', e.target.value)}
              placeholder="e.g. Hacker News: Rust hits new adoption milestone"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wp-title">Title</Label>
            <Input
              id="wp-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Your hook / headline"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wp-desc">Description</Label>
            <Textarea
              id="wp-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Write the post body yourself…"
              rows={8}
              className="resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wp-tags">Hashtags</Label>
            <Input
              id="wp-tags"
              value={form.hashtags}
              onChange={(e) => set('hashtags', e.target.value)}
              placeholder="rust, programming, systems (comma separated)"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Target platforms</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {PLATFORMS.map((p) => {
                const active = form.platforms.includes(p)
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {PLATFORM_LABEL[p]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wp-sched">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                Schedule (optional)
              </span>
            </Label>
            <Input
              id="wp-sched"
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => set('scheduledAt', e.target.value)}
            />
          </div>
        </div>

        {/* The one card that stays — live preview with the platform switcher */}
        <PostPreview
          title={form.title}
          description={form.description}
          hashtags={tagList}
          imageUrl={null}
          platform={previewPlatform}
          onPlatformChange={setPreviewPlatform}
        />
      </div>
    </div>
  )
}

