import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, Save, CalendarClock, CheckCircle2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type {
  GeneratedVariant,
  CarouselSlide,
  Tone,
  ImageStyleId,
  ModelUsage,
  PostRecord,
  PostStatus,
  Platform,
  PublicationMap,
  CrawlerTopic
} from '@shared/types'
import { PLATFORMS, IMAGE_STYLES } from '@shared/types'
import { api } from '@/renderer/lib/api'
import { cn } from '@/renderer/lib/utils'
import { usePosts } from '@/renderer/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/renderer/components/ui/card'
import { Button } from '@/renderer/components/ui/button'
import { Input, Textarea, Label, Select } from '@/renderer/components/ui/input'
import { Badge } from '@/renderer/components/ui/badge'
import { PageHeader } from '@/renderer/components/ui/PageHeader'
import { VariantCardSkeleton } from '@/renderer/components/ui/skeleton'
import { PostPreview, CharCounter, PLATFORM_LIMITS, PLATFORM_LABEL } from '@/renderer/components/PostPreview'

interface Editable extends GeneratedVariant {
  selected: boolean
}

const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'bold', label: 'Bold' }
]

// Friendly labels for the image style picker (mirrors backend presets).
const STYLE_LABELS: Record<ImageStyleId, string> = {
  'editorial-photo': 'Editorial photo',
  cinematic: 'Cinematic',
  documentary: 'Documentary',
  'product-natural': 'Product',
  'film-portrait': 'Film portrait',
  'swiss-poster': 'Swiss poster',
  'riso-print': 'Risograph',
  'flat-vector': 'Flat vector',
  'muted-brand': 'Muted brand'
}

// Autosave key for the in-progress working state (never leaves the renderer).
const AUTOSAVE_KEY = 'postly.generate.working'

interface WorkingState {
  topic: string
  carousel: boolean
  tone: Tone
  imageStyle: ImageStyleId
  variants: Editable[]
  slides: CarouselSlide[] | null
  image: string | null
}

function loadWorking(): WorkingState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    return raw ? (JSON.parse(raw) as WorkingState) : null
  } catch {
    return null
  }
}

export default function GeneratePost() {
  const location = useLocation() as { state?: { topic?: string } }
  const navigate = useNavigate()
  const upsertLocal = usePosts((s) => s.upsertLocal)
  const save = usePosts((s) => s.save)

  const restored = useRef<WorkingState | null>(loadWorking())

  const [topic, setTopic] = useState(location.state?.topic ?? restored.current?.topic ?? '')
  const [carousel, setCarousel] = useState(restored.current?.carousel ?? false)
  const [tone, setTone] = useState<Tone>(restored.current?.tone ?? 'casual')
  const [imageStyle, setImageStyle] = useState<ImageStyleId>(restored.current?.imageStyle ?? 'editorial-photo')
  const [forceText, setForceText] = useState('')
  const [forceImage, setForceImage] = useState('')
  const [models, setModels] = useState<ModelUsage[]>([])
  const [generating, setGenerating] = useState(false)
  const [variants, setVariants] = useState<Editable[]>(restored.current?.variants ?? [])
  const [slides, setSlides] = useState<CarouselSlide[] | null>(restored.current?.slides ?? null)
  const [image, setImage] = useState<string | null>(restored.current?.image ?? null)
  const [provider, setProvider] = useState<string>('')

  const [suggestions, setSuggestions] = useState<CrawlerTopic[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [platform, setPlatform] = useState<Platform>('x')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([])
  const [defaultStyle, setDefaultStyle] = useState('')
  const [scheduleAt, setScheduleAt] = useState('')
  const [saving, setSaving] = useState<null | PostStatus>(null)

  useEffect(() => {
    api.aiStatus().then((s) => setModels(s.models)).catch(() => { })
    loadSuggestions(false)
    // Apply the user's saved defaults (tone/platform/style).
    api
      .getPrefs()
      .then((prefs) => {
        if (prefs.defaultTone === 'professional' || prefs.defaultTone === 'casual' || prefs.defaultTone === 'bold')
          setTone(prefs.defaultTone)
        if (prefs.defaultPlatforms) {
          const list = (prefs.defaultPlatforms.split(',') as Platform[]).filter((p) => PLATFORMS.includes(p))
          setSelectedPlatforms(list)
        }
        if (prefs.defaultStyle) setDefaultStyle(prefs.defaultStyle)
        if (prefs.carouselDefault === 'on') setCarousel(true)
      })
      .catch(() => { })
  }, [])

  // Debounced autosave of the working state so a refresh/accidental close
  // doesn't lose in-progress edits. Cleared once the post is persisted.
  useEffect(() => {
    const id = setTimeout(() => {
      const state: WorkingState = { topic, carousel, tone, imageStyle, variants, slides, image }
      try {
        if (topic || variants.length) localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state))
      } catch {
        /* storage full or unavailable — autosave is best-effort */
      }
    }, 500)
    return () => clearTimeout(id)
  }, [topic, carousel, tone, imageStyle, variants, slides, image])

  const textModels = models.filter((m) => m.kind === 'text')
  const imageModels = models.filter((m) => m.kind === 'image')
  const selected = useMemo(
    () => variants.find((v) => v.selected) ?? variants[0] ?? null,
    [variants]
  )

  async function generate() {
    if (!topic.trim()) return toast.error('Enter a topic first')
    setGenerating(true)
    setVariants([])
    try {
      const res = await api.generate({
        topic: topic.trim(),
        carousel,
        slidesCount: carousel ? 6 : undefined,
        tone,
        imageStyle,
        forceTextModel: forceText || undefined,
        forceImageModel: forceImage || undefined
      })
      setVariants(
        res.variants.map((v, i) => ({
          ...v,
          selected: defaultStyle ? v.style === defaultStyle : i === 0
        }))
      )
      setSlides(res.slides)
      setImage(res.imageUrl)
      setProvider(res.imageProvider ? `${res.textProvider} · img ${res.imageProvider}` : res.textProvider)
      toast.success(`Generated with ${res.textProvider}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  // Pull topic suggestions. refresh:true re-crawls live (bypasses the cache);
  // we then show a random 6 so every click offers genuinely new ideas.
  async function loadSuggestions(refresh: boolean) {
    setSuggesting(true)
    try {
      const t = await api.fetchTopics({ refresh })
      const picks = [...t]
      for (let i = picks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
          ;[picks[i], picks[j]] = [picks[j], picks[i]]
      }
      setSuggestions(picks.slice(0, 6))
      if (!t.length) toast('No suggestions found right now')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSuggesting(false)
    }
  }

  function edit(i: number, patch: Partial<GeneratedVariant>) {
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)))
  }

  function togglePlatform(p: Platform) {
    setSelectedPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
  }

  // Build + persist the selected variant with the given status. `status` drives
  // the Save Draft / Mark Ready / Schedule buttons.
  async function persist(nextStatus: PostStatus) {
    const chosen = selected
    if (!chosen) return toast.error('Nothing to save yet')
    if (nextStatus === 'scheduled' && !scheduleAt) {
      return toast.error('Pick a date and time to schedule')
    }
    setSaving(nextStatus)
    try {
      const draft: PostRecord = await api.toDraft(topic.trim(), chosen, image, slides)
      // Every selected platform starts 'ready'; the ReadyToPost panel flips
      // them to 'posted' as the user publishes manually.
      const publication: PublicationMap = {}
      for (const p of selectedPlatforms) publication[p] = { status: 'ready', postedAt: null }
      const record: PostRecord = {
        ...draft,
        platforms: selectedPlatforms,
        publication,
        status: nextStatus,
        scheduledAt: nextStatus === 'scheduled' ? new Date(scheduleAt).toISOString() : null
      }
      upsertLocal(record)
      await save(record)
      localStorage.removeItem(AUTOSAVE_KEY)
      toast.success(
        nextStatus === 'scheduled'
          ? 'Scheduled'
          : nextStatus === 'pending'
            ? 'Marked ready'
            : 'Saved to drafts'
      )
      navigate('/drafts')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  // Ctrl+S / Cmd+S saves a draft from anywhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (selected && !saving) persist('draft')
      } else if (meta && e.key === 'Enter') {
        e.preventDefault()
        if (selected && !saving) persist('pending')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, saving, scheduleAt, topic, image, slides, selectedPlatforms])

  const limit = PLATFORM_LIMITS[platform]

  return (
    <div>
      <PageHeader
        title="Generate Post"
        description="Three ready-to-edit styles, plus an optional carousel and styled, text-free images."
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="topic">Topic</Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Groq just made Llama 3.3 70B free…"
              />
            </div>
            <label className="flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm">
              <input type="checkbox" checked={carousel} onChange={(e) => setCarousel(e.target.checked)} />
              Carousel
            </label>
            <Button onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate
            </Button>
          </div>

          {/* Blueprint & Comparison Quick Starters */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 self-center text-xs font-medium text-muted-foreground">Blueprints:</span>
            {[
              {
                label: 'AI Agent (n8n + MCP)',
                topic: 'How to build autonomous AI agents with n8n, LangGraph & MCP: Step-by-Step Architecture'
              },
              {
                label: 'LLM Core & RAG',
                topic: 'LLM Deep-Dive: Quantization (GGUF/AWQ), Attention Mechanisms & Agentic RAG in 2026'
              },
              {
                label: 'GraphQL vs gRPC vs REST',
                topic: 'System Design Battle: GraphQL vs gRPC vs REST in 2026 (When to use which)'
              },
              {
                label: 'PostgreSQL vs MongoDB',
                topic: 'Database Architecture Comparison: PostgreSQL vs MongoDB at Scale'
              },
              {
                label: 'Redis vs Dragonfly',
                topic: 'High-Throughput Caching Teardown: Redis vs Dragonfly vs KeyDB vs Memcached'
              },
              {
                label: 'Scale 100K Stack',
                topic: 'Modern full-stack tech architecture to scale from 1K to 100K+ users: Next.js 15, Drizzle, Postgres & Redis'
              },
              {
                label: 'Open-Source Replacements',
                topic: 'Top 10 Open-Source GitHub tools that replace expensive paid SaaS (n8n, Supabase, PostHog, Cal.com, Documenso)'
              },
              {
                label: 'UI & Component Kits',
                topic: 'Best modern developer UI component libraries and visual inspiration: Shadcn UI, Aceternity, 21st.dev & Magic UI'
              },
              {
                label: 'Free Dev Fonts',
                topic: 'Top 5 free developer fonts for clean code, dashboards, and modern UI (Geist Mono, Inter, Outfit, Fira Code)'
              },
              {
                label: 'Web Performance & Edge',
                topic: 'Frontend Optimization Masterclass: Core Web Vitals, Edge Compute, Font Loading & Bundle Splitting'
              }
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setTopic(p.topic)}
                className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/15 transition-all"
              >
                {p.label}
              </button>
            ))}
          </div>


          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 self-center text-xs font-medium text-muted-foreground">Live Crawled</span>
              {suggestions.map((s) => (
                <button
                  key={s.url ?? s.title}
                  type="button"
                  onClick={() => setTopic(s.title)}
                  className="rounded-full border px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {s.title.length > 46 ? s.title.slice(0, 46) + '…' : s.title}
                </button>
              ))}
              <button
                type="button"
                onClick={() => loadSuggestions(true)}
                disabled={suggesting}
                title="Re-crawl and suggest brand-new topics"
                className="ml-1 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
              >
                <RefreshCw className={`h-3 w-3 ${suggesting ? 'animate-spin' : ''}`} />
                {suggesting ? 'Finding…' : 'New topics'}
              </button>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="tone">Tone</Label>
              <Select id="tone" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                {TONE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="forceText">Text model</Label>
              <Select id="forceText" value={forceText} onChange={(e) => setForceText(e.target.value)}>
                <option value="">Auto (fallback)</option>
                {textModels.map((m) => (
                  <option key={m.provider} value={m.provider} disabled={!m.available}>
                    {m.label}{m.available ? '' : ' (unavailable)'}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="forceImage">Image model</Label>
              <Select id="forceImage" value={forceImage} onChange={(e) => setForceImage(e.target.value)}>
                <option value="">Auto (fallback)</option>
                {imageModels.map((m) => (
                  <option key={m.provider} value={m.provider} disabled={!m.available}>
                    {m.label}{m.available ? '' : ' (unavailable)'}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <Label>Image style</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {IMAGE_STYLES.map((sid) => (
                <button
                  key={sid}
                  type="button"
                  onClick={() => setImageStyle(sid)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    sid === imageStyle
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {STYLE_LABELS[sid]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Images ship without text baked in (captions carry the words) and use realistic
              lighting/palettes to avoid the oversaturated “AI look”.
            </p>
          </div>

          {provider && <p className="mt-3 font-mono text-xs text-muted-foreground">Model used: {provider}</p>}
        </CardContent>
      </Card>

      {generating && (
        <div className="grid gap-4 md:grid-cols-3">
          <VariantCardSkeleton />
          <VariantCardSkeleton />
          <VariantCardSkeleton />
        </div>
      )}

      {!generating && variants.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            {image && (
              <div className="mb-6">
                <Label>Generated image</Label>
                <img src={image} alt="post" className="mt-1.5 max-h-64 rounded-lg border border-border object-cover" />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {variants.map((v, i) => (
                <Card key={i} className={v.selected ? 'ring-2 ring-primary' : ''}>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="capitalize">{v.style}</CardTitle>
                    <Button
                      size="sm"
                      variant={v.selected ? 'default' : 'outline'}
                      onClick={() => setVariants((vs) => vs.map((x, idx) => ({ ...x, selected: idx === i })))}
                    >
                      {v.selected ? 'Selected' : 'Select'}
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <Label>Title</Label>
                        <CharCounter value={v.title} limit={limit} />
                      </div>
                      <Input value={v.title} onChange={(e) => edit(i, { title: e.target.value })} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label>Description</Label>
                        <CharCounter value={v.description} limit={limit} />
                      </div>
                      <Textarea
                        value={v.description}
                        onChange={(e) => edit(i, { description: e.target.value })}
                        className={v.description.length > limit ? 'border-rose-500/50' : ''}
                      />
                    </div>
                    <div>
                      <Label>Hashtags</Label>
                      <div className="flex flex-wrap gap-1">
                        {v.hashtags.map((h) => (
                          <Badge key={h} variant="secondary">{h}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {slides && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Carousel · {slides.length} slides</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {slides.map((s) => (
                    <div key={s.index} className="overflow-hidden rounded-lg border text-sm">
                      {s.imageUrl && (
                        <img
                          src={s.imageUrl}
                          alt={`Slide ${s.index}`}
                          className="aspect-[4/5] w-full object-cover"
                        />
                      )}
                      <div className="p-3">
                        <div className="font-medium">{s.index}. {s.title}</div>
                        <div className="mt-1 text-muted-foreground">{s.body}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="mt-6 rounded-[14px] border border-border bg-card p-4 shadow-sm">
              <Label>Platforms for this post</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PLATFORMS.map((p) => {
                  const active = selectedPlatforms.includes(p)
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        active
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {PLATFORM_LABEL[p]}
                    </button>
                  )
                })}
              </div>
              {selectedPlatforms.length === 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Pick at least one platform so the post has somewhere to go.
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-2">
                <div>
                  <Label htmlFor="scheduleAt">Schedule for</Label>
                  <Input
                    id="scheduleAt"
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className="w-52"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => persist('draft')} disabled={!!saving}>
                  {saving === 'draft' ? <Loader2 className="animate-spin" /> : <Save />} Save Draft
                </Button>
                <Button variant="secondary" onClick={() => persist('pending')} disabled={!!saving}>
                  {saving === 'pending' ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Mark Ready
                </Button>
                <Button onClick={() => persist('scheduled')} disabled={!!saving}>
                  {saving === 'scheduled' ? <Loader2 className="animate-spin" /> : <CalendarClock />} Schedule
                </Button>
              </div>
            </div>
            <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground sm:text-right">
              tip: press Ctrl+S to save a draft
            </p>
          </div>

          <div className="lg:sticky lg:top-8 lg:self-start">
            <Label className="mb-1.5 block">Preview</Label>
            {selected && (
              <PostPreview
                title={selected.title}
                description={selected.description}
                hashtags={selected.hashtags}
                imageUrl={image}
                platform={platform}
                onPlatformChange={setPlatform}
              />
            )}
          </div>
        </div>
      )}

      {!generating && variants.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Enter a topic (or pick a suggestion) and press <span className="font-mono text-primary">Generate</span>.
        </p>
      )}
    </div>
  )
}
