import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, RefreshCw } from 'lucide-react'
import type { CrawlerTopic } from '@shared/types'
import { api } from '@/renderer/lib/api'
import { familyOf } from '@/renderer/lib/topics'
import { Button } from '@/renderer/components/ui/button'
import {
  GithubIcon,
  RedditIcon,
  XIcon,
  LinkedinIcon,
  YoutubeIcon,
  FacebookIcon,
  InstagramIcon,
  ThreadsIcon,
  HackerNewsIcon,
  BlueskyIcon
} from '@/renderer/components/BrandIcons'
import { cn } from '@/renderer/lib/utils'
import { toast } from 'sonner'

function FamilyIcon({ family, className }: { family: string; className?: string }) {
  const f = family.toLowerCase()
  if (f.includes('github')) return <GithubIcon className={className} />
  if (f.includes('reddit')) return <RedditIcon className={className} />
  if (f.includes('youtube')) return <YoutubeIcon className={className} />
  if (f.includes('facebook')) return <FacebookIcon className={className} />
  if (f.includes('instagram')) return <InstagramIcon className={className} />
  if (f.includes('threads')) return <ThreadsIcon className={className} />
  if (f.includes('hacker')) return <HackerNewsIcon className={className} />
  if (f.includes('bluesky')) return <BlueskyIcon className={className} />
  if (f.includes('x') || f.includes('twitter')) return <XIcon className={className} />
  if (f.includes('linkedin')) return <LinkedinIcon className={className} />
  return (
    <span className={cn(className, 'inline-flex items-center justify-center font-num text-xs font-bold')}>
      {family.charAt(0)}
    </span>
  )
}

// "youtube/freeCodeCamp" -> "freeCodeCamp" so the card can credit the exact
// channel/subreddit/handle, not just the platform family.
function channelOf(topic: CrawlerTopic): string | null {
  const idx = topic.source.indexOf('/')
  return idx > -1 && idx < topic.source.length - 1 ? topic.source.slice(idx + 1) : null
}

export default function TopicRadar() {
  const navigate = useNavigate()
  const [topics, setTopics] = useState<CrawlerTopic[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // Selected source family — one bar, no "All": a family shows only its topics.
  const [family, setFamily] = useState<string | null>(null)

  const fetchTopics = async (refresh = false) => {
    setLoading(true)
    try {
      const results = await api.fetchTopics({ refresh })
      setTopics(results)
      if (refresh) toast.success(`Fetched ${results.length} fresh live topics from all platforms!`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTopics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Families ranked by volume; the busiest one is selected by default.
  const families = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of topics) {
      const f = familyOf(t.source)
      counts.set(f, (counts.get(f) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f)
  }, [topics])

  useEffect(() => {
    if (!family && families.length) setFamily(families[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [families.join(',')])

  // One card per topic — filtered to the selected family + free-text search.
  // Every crawled topic stays browsable (the crawl delivers 90+ per platform);
  // the render cap just guards against pathological dom size.
  const TOPICS_PER_FAMILY = 150
  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const counts = new Map<string, number>()
    return topics.filter((t) => {
      if (family && familyOf(t.source) !== family) return false
      if (q && !t.title.toLowerCase().includes(q)) return false
      const f = familyOf(t.source)
      const n = counts.get(f) ?? 0
      if (n >= TOPICS_PER_FAMILY) return false
      counts.set(f, n + 1)
      return true
    })
  }, [topics, family, searchQuery])

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in fade-in duration-200">
      {/* Source-family bar: pick one platform, see only its topics */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar">
        {families.map((f) => {
          const active = family === f
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFamily(f)}
              className={cn(
                'whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
              )}
            >
              {f}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topics"
            className="h-9 w-full rounded-full bg-secondary/70 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button size="sm" onClick={() => fetchTopics(true)} disabled={loading}>
          <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} />
          {loading ? 'Crawling Live…' : 'Refresh All Topics'}
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-500/40 py-20 text-center">
          <p className="text-sm text-muted-foreground">
            {loading ? 'Crawling live topics…' : 'No topics in this source yet'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((topic, i) => (
            <button
              key={`${topic.source}-${i}`}
              type="button"
              onClick={() => navigate(`/topic?title=${encodeURIComponent(topic.title)}`)}
              className="group relative flex min-h-[200px] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-[linear-gradient(160deg,#0b0b0d_0%,#141417_100%)] p-6 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-lg"
            >
              {/* fine graph-paper grid, faded towards the edges (reference card) */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.35]"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)',
                  backgroundSize: '22px 22px',
                  maskImage:
                    'radial-gradient(120% 120% at 30% 20%, black 30%, transparent 85%)',
                  WebkitMaskImage:
                    'radial-gradient(120% 120% at 30% 20%, black 30%, transparent 85%)'
                }}
              />
              {/* warm glow rising from the bottom-right corner */}
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_130%_at_100%_100%,rgba(249,115,22,0.20),transparent_55%)] opacity-80 transition-opacity group-hover:opacity-100" />

              <div className="relative flex items-start justify-between gap-3">
                <h3 className="line-clamp-3 font-title text-lg font-medium leading-snug tracking-tight text-white transition-colors group-hover:text-primary">
                  {topic.title}
                </h3>
                {/* card position, e.g. 1/103 — current number in orange, total muted */}
                <span className="shrink-0 font-num text-sm tabular-nums">
                  <span className="font-semibold text-orange-400">{i + 1}</span>
                  <span className="text-muted-foreground/70">/{visible.length}</span>
                </span>
              </div>

              <div className="relative mt-4 flex items-end justify-between gap-3">
                <span className="truncate text-xs text-muted-foreground">
                  By{' '}
                  <span className="font-medium text-foreground/80">
                    {channelOf(topic) ?? familyOf(topic.source)}
                  </span>
                </span>
                <FamilyIcon
                  family={familyOf(topic.source)}
                  className="h-6 w-6 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-primary"
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
