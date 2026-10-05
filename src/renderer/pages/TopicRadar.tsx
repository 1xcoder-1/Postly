import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, RefreshCw, Sparkles, ExternalLink, Star } from 'lucide-react'
import type { CrawlerTopic } from '@shared/types'
import { api } from '@/renderer/lib/api'
import { Button } from '@/renderer/components/ui/button'
import { toast } from 'sonner'

export default function TopicRadar() {
  const navigate = useNavigate()
  const [topics, setTopics] = useState<CrawlerTopic[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBatch, setSelectedBatch] = useState('All Sources')
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming' | 'past'>('live')
  const [onlyPending, setOnlyPending] = useState(false)

  const fetchTopics = async (refresh = false) => {
    setLoading(true)
    try {
      const results = await api.fetchTopics({ refresh, highEngagementOnly: onlyPending })
      setTopics(results)
      if (refresh) {
        toast.success(`Fetched ${results.length} fresh live topics from all platforms!`)
      }
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

  // Map a raw crawler source ("youtube/freeCodeCamp", "reddit/webdev", "hackernews")
  // to a friendly family label so the dropdown actually filters.
  const familyOf = (source: string): string => {
    const s = source.toLowerCase()
    if (s.startsWith('youtube')) return 'YouTube'
    if (s.startsWith('github')) return 'GitHub'
    if (s.startsWith('reddit')) return 'Reddit'
    if (s.startsWith('instagram')) return 'Instagram'
    if (s.startsWith('linkedin')) return 'LinkedIn'
    if (s === 'hackernews' || s.startsWith('hn')) return 'Hacker News'
    if (s.startsWith('daily')) return 'daily.dev'
    if (s.startsWith('v2ex')) return 'V2EX'
    if (s.startsWith('agent-reach') || s.startsWith('agentreach')) return 'Agent Reach'
    if (s === 'x' || s.startsWith('x/')) return 'X / Twitter'
    const head = s.split('/')[0]
    return head.charAt(0).toUpperCase() + head.slice(1)
  }

  const families = useMemo(
    () => ['All Sources', ...Array.from(new Set(topics.map((t) => familyOf(t.source)))).sort()],
    [topics]
  )

  const PLATFORM_PILLS = [
    { id: 'all', label: 'All Platforms', family: 'All Sources' },
    { id: 'github', label: 'GitHub', family: 'GitHub' },
    { id: 'x', label: 'X / Twitter', family: 'X / Twitter' },
    { id: 'reddit', label: 'Reddit', family: 'Reddit' },
    { id: 'linkedin', label: 'LinkedIn', family: 'LinkedIn' },
    { id: 'instagram', label: 'Instagram', family: 'Instagram' },
    { id: 'youtube', label: 'YouTube', family: 'YouTube' },
    { id: 'bsky', label: 'Bluesky', family: 'Bsky' },
    { id: 'hn', label: 'Hacker News', family: 'Hacker News' },
    { id: 'daily', label: 'daily.dev', family: 'daily.dev' }
  ]

  const countForPlatform = (family: string): number => {
    if (family === 'All Sources') return topics.length
    return topics.filter((t) => familyOf(t.source) === family).length
  }

  const filtered = topics.filter((t) => {
    if (selectedBatch !== 'All Sources' && familyOf(t.source) !== selectedBatch) return false
    if (searchQuery.trim() && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const badgeStyle = (source: string): string => {
    const s = source.toLowerCase()
    if (s.startsWith('github')) return 'bg-emerald-500/10 text-emerald-400'
    if (s.startsWith('reddit')) return 'bg-orange-500/10 text-orange-400'
    if (s.startsWith('x') || s === 'twitter') return 'bg-sky-500/10 text-sky-400'
    if (s.startsWith('linkedin')) return 'bg-blue-500/10 text-blue-400'
    if (s.startsWith('instagram')) return 'bg-pink-500/10 text-pink-400'
    if (s.startsWith('youtube')) return 'bg-red-500/10 text-red-400'
    return 'bg-secondary/60 text-muted-foreground'
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in fade-in duration-200">
      {/* Header — MasterJi 22px medium h1 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight text-foreground">Topic Radar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live multi-platform intelligence — {topics.length}+ real-time topics crawled across GitHub, X, Reddit, LinkedIn, Instagram, and YouTube.
          </p>
        </div>

        <Button size="sm" onClick={() => fetchTopics(true)} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Crawling Live…' : 'Refresh All Topics'}
        </Button>
      </div>

      {/* Filter and Search Bar — pill search like MasterJi Blogs page */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col sm:flex-row items-center gap-2.5">
          {/* Search bar */}
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Topics & Repos"
              className="h-9 w-full rounded-full bg-secondary/70 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Batch / Source Selector */}
          <div className="relative w-full sm:w-48">
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="h-9 w-full cursor-pointer appearance-none rounded-full bg-secondary/70 px-3.5 pr-9 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-popover [&_option]:text-foreground"
            >
              {families.map((f) => (
                <option key={f} value={f}>
                  {f} ({countForPlatform(f)})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          {/* Re-crawl button */}
          <Button variant="flat" size="sm" onClick={() => fetchTopics(true)}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Re-Crawl Live
          </Button>
        </div>

        {/* Pending Toggle */}
        <div className="flex items-center gap-2.5 self-start lg:self-center">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-secondary/70 accent-primary"
            />
            <span>High Engagement Only</span>
          </label>
        </div>
      </div>

      {/* Platform Pills with Live Topic Counts */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar">
        {PLATFORM_PILLS.map((pill) => {
          const active = selectedBatch === pill.family
          const count = countForPlatform(pill.family)
          return (
            <button
              key={pill.id}
              onClick={() => setSelectedBatch(pill.family)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{pill.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  active ? 'bg-black/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>


      {/* Tabs — MasterJi underline style */}
      <div className="flex items-center gap-6 border-b border-border pb-1">
        {[
          { id: 'live', label: `Live (${filtered.length})` },
          { id: 'upcoming', label: 'Upcoming (0)' },
          { id: 'past', label: 'Past (0)' }
        ].map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`relative pb-3 text-sm font-medium capitalize transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>

      {/* Content Area */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-500/40 py-20 text-center">
          <p className="text-sm text-muted-foreground">
            No topic suggestions available in this category
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((topic, i) => (
            <div
              key={i}
              className="group flex flex-col justify-between rounded-[14px] border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
            >
              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${badgeStyle(topic.source)}`}>
                    {topic.source}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <Star className="h-3 w-3" /> {topic.score ?? 0}
                  </span>
                </div>

                <h3 className="text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                  {topic.title}
                </h3>
              </div>


              <div className="mt-5 flex items-center justify-between border-t border-border pt-3.5">
                {topic.url ? (
                  <button
                    type="button"
                    onClick={() => api.openExternal(topic.url!)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View Reference <ExternalLink className="h-3 w-3" />
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Trending Feed</span>
                )}

                <Button size="sm" onClick={() => navigate('/generate', { state: { topic: topic.title } })}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Generate Post
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
