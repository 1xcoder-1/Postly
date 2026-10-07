import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Star,
  ExternalLink,
  Layers,
  Sparkles,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  PenLine,
  Pencil,
  Save,
  X,
  ImageIcon
} from 'lucide-react'
import type { CrawlerTopic, ImageBrief } from '@shared/types'
import { api } from '@/renderer/lib/api'
import { familyOf, relatedTopics, groupByFamily, FAMILY_COLORS } from '@/renderer/lib/topics'
import { Button } from '@/renderer/components/ui/button'
import { Textarea } from '@/renderer/components/ui/input'
import { toast } from 'sonner'

/** Briefs cached per topic title so re-opening a card doesn't burn quota. */
const briefCache = new Map<string, ImageBrief>()

export default function TopicDetailPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const title = params.get('title') ?? ''

  const [topics, setTopics] = useState<CrawlerTopic[] | null>(null)
  const [brief, setBrief] = useState<ImageBrief | null>(() => briefCache.get(title) ?? null)
  const [loading, setLoading] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ImageBrief | null>(null)

  // The crawled list is cached backend-side; find this topic by its title.
  useEffect(() => {
    let cancelled = false
    api
      .fetchTopics()
      .then((t) => !cancelled && setTopics(t))
      .catch((e) => !cancelled && toast.error((e as Error).message))
    return () => {
      cancelled = true
    }
  }, [])

  const topic = useMemo(
    () => topics?.find((t) => t.title === title) ?? null,
    [topics, title]
  )

  const related = useMemo(
    () => (topic ? groupByFamily(relatedTopics(topic, topics ?? [])) : []),
    [topic, topics]
  )

  async function fetchBrief() {
    if (!title || loading) return
    setLoading(true)
    try {
      const b = await api.imageBrief(title)
      briefCache.set(title, b)
      setBrief(b)
      setEditing(false)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to get the image brief')
    } finally {
      setLoading(false)
    }
  }

  async function copyPrompt(prompt: string, idx: number) {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1500)
    } catch {
      toast.error('Clipboard unavailable')
    }
  }

  function startEdit() {
    setDraft(brief ? { ...brief, prompts: [...brief.prompts] } : null)
    setEditing(true)
  }

  function saveEdit() {
    if (draft) {
      const clean = { ...draft, prompts: draft.prompts.map((p) => p.trim()).filter(Boolean) }
      briefCache.set(title, clean)
      setBrief(clean)
    }
    setEditing(false)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in fade-in duration-200">
      <div>
        <Link
          to="/topics"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Topic Radar
        </Link>
      </div>

      {!topics ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-500/40 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading topic…
        </div>
      ) : !topic ? (
        <div className="rounded-lg border border-dashed border-gray-500/40 py-20 text-center text-sm text-muted-foreground">
          This topic is no longer in the current crawl.{' '}
          <button className="text-primary hover:underline" onClick={() => navigate('/topics')}>
            Pick another card
          </button>
          .
        </div>
      ) : (
        <>
          {/* Topic header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-secondary/60 px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                {familyOf(topic.source)}
              </span>
              <span className="flex items-center gap-1 text-xs text-orange-400">
                <Star className="h-3 w-3 fill-current" /> {topic.score ?? 0}
              </span>
              {topic.url && (
                <button
                  type="button"
                  onClick={() => api.openExternal(topic.url!)}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  View original <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
            <h1 className="font-title text-2xl font-bold leading-snug tracking-tight text-white">
              {topic.title}
            </h1>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Coverage across platforms */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Layers className="h-4 w-4 text-primary" />
                Coverage across platforms
                <span className="text-xs font-normal text-muted-foreground">
                  ({related.reduce((n, [, arr]) => n + arr.length, 0)} related)
                </span>
              </div>

              {related.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-500/40 py-10 text-center text-sm text-muted-foreground">
                  No other crawler picked up this subject yet.
                </div>
              ) : (
                <div className="space-y-5">
                  {related.map(([family, items]) => (
                    <div key={family}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            FAMILY_COLORS[family] ?? 'bg-secondary/60 text-muted-foreground'
                          }`}
                        >
                          {family}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {items.length} item{items.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="divide-y divide-border/60 rounded-lg border border-border">
                        {items.slice(0, 6).map((t, i) => (
                          <button
                            key={`${t.url ?? t.title}-${i}`}
                            type="button"
                            onClick={() => t.url && api.openExternal(t.url)}
                            className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/50"
                          >
                            <span className="line-clamp-2 text-[13px] leading-snug text-foreground">
                              {t.title}
                            </span>
                            <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1 text-orange-400/80">
                                <Star className="h-3 w-3" /> {t.score ?? 0}
                              </span>
                              {t.url && <ExternalLink className="h-3 w-3" />}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Gemini image brief — the app's one AI feature, editable */}
            <div className="space-y-4">
              <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <ImageIcon className="h-4 w-4 text-primary" /> Image Brief
                  </span>
                  <div className="flex items-center gap-2">
                    {brief && !editing && (
                      <button
                        type="button"
                        onClick={startEdit}
                        title="Edit the generated text"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    )}
                    {brief && !editing && (
                      <button
                        type="button"
                        onClick={fetchBrief}
                        disabled={loading}
                        title="Ask Gemini again"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                      >
                        <RefreshCw className={loading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} /> Regenerate
                      </button>
                    )}
                  </div>
                </div>

                {!brief && !loading && (
                  <div className="space-y-3 py-2">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Ask Gemini what type of image would suit this topic and get copy-ready
                      prompts you can paste into any image generator. Text advice only — nothing
                      is generated or posted for you.
                    </p>
                    <Button variant="outline" size="sm" className="w-full" onClick={fetchBrief}>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
                      Describe the visual
                    </Button>
                  </div>
                )}

                {loading && !brief && (
                  <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-xs">Asking Gemini about the visual…</span>
                  </div>
                )}

                {brief && editing && draft && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        What the image should look like
                      </span>
                      <Textarea
                        value={draft.visualDescription}
                        onChange={(e) => setDraft({ ...draft, visualDescription: e.target.value })}
                        rows={4}
                      />
                    </div>
                    <div className="space-y-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Prompts
                      </span>
                      {draft.prompts.map((p, i) => (
                        <Textarea
                          key={i}
                          value={p}
                          onChange={(e) => {
                            const next = [...draft.prompts]
                            next[i] = e.target.value
                            setDraft({ ...draft, prompts: next })
                          }}
                          rows={6}
                        />
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                        <X className="mr-1 h-3.5 w-3.5" /> Cancel
                      </Button>
                      <Button size="sm" onClick={saveEdit}>
                        <Save className="mr-1.5 h-3.5 w-3.5" /> Save
                      </Button>
                    </div>
                  </div>
                )}

                {brief && !editing && (
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        What the image should look like
                      </div>
                      <p className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-[13px] leading-relaxed text-foreground">
                        {brief.visualDescription}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Copy-ready prompts
                      </div>
                      {brief.prompts.map((p, i) => (
                        <div key={i} className="relative rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
                          <p className="whitespace-pre-wrap pr-8 text-[12.5px] leading-relaxed text-foreground/90">{p}</p>
                          <button
                            type="button"
                            onClick={() => copyPrompt(p, i)}
                            title="Copy prompt"
                            className="absolute right-2 top-2 rounded-md border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {copiedIdx === i ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  className="mt-4 w-full"
                  onClick={() => navigate(`/write?topic=${encodeURIComponent(topic.title)}`)}
                >
                  <PenLine className="mr-1.5 h-4 w-4" />
                  Write this post
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
