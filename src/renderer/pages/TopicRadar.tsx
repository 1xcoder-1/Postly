import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  ChevronDown,
  Filter,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Flame,
  Globe,
  Radio,
  Share2
} from 'lucide-react'
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

  const filtered = topics.filter((t) => {
    if (selectedBatch !== 'All Sources' && familyOf(t.source) !== selectedBatch) return false
    if (searchQuery.trim() && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in fade-in duration-200">
      {/* Header matching screenshot 1 (Blogs) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Topic Radar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Write daily social posts on trending tech topics and scrape live dev channels.
          </p>
        </div>

        <Button
          onClick={() => fetchTopics(true)}
          disabled={loading}
          className="rounded-full bg-primary font-medium text-white shadow-lg hover:bg-primary/90"
        >
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Crawling…' : 'Refresh Topics'}
        </Button>
      </div>

      {/* Filter and Search Bar matching screenshot */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col sm:flex-row items-center gap-2.5">
          {/* Search bar */}
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Topics"
              className="w-full rounded-xl border border-[#27272a] bg-[#141417] pl-10 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Batch / Source Selector */}
          <div className="relative w-full sm:w-48">
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="w-full appearance-none rounded-xl border border-[#27272a] bg-[#141417] px-3.5 py-2 pr-8 text-sm text-zinc-200 focus:border-primary focus:outline-none"
            >
              {families.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          </div>

          {/* More Filter Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTopics(true)}
            className="h-9 rounded-xl border-[#27272a] bg-[#141417] text-zinc-300 hover:border-primary/40 hover:text-white"
          >
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            More
          </Button>
        </div>

        {/* Pending Toggle */}
        <div className="flex items-center gap-2.5 self-start lg:self-center">
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
              className="h-4 w-4 rounded border-[#27272a] bg-[#141417] text-primary accent-[#f06e1e]"
            />
            <span>High Engagement Only</span>
          </label>
        </div>
      </div>

      {/* Tabs matching screenshot */}
      <div className="flex items-center gap-6 border-b border-[#232328] pb-1">
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
              className={`relative pb-3 text-sm font-semibold capitalize transition-colors ${isActive ? 'text-primary' : 'text-zinc-400 hover:text-zinc-200'
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#232328] bg-[#141417] py-20 text-center">
          <p className="text-sm font-medium text-zinc-500">
            No topic suggestions available in this category
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((topic, i) => (
            <div
              key={i}
              className="group flex flex-col justify-between rounded-2xl border border-[#232328] bg-[#141417] p-5 shadow-lg transition-all hover:border-[#f06e1e]/60 hover:bg-[#18181c]"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                  <span className="rounded-full border border-zinc-700/50 bg-zinc-800/60 px-2.5 py-0.5 text-[11px] font-semibold text-orange-400 capitalize">
                    {topic.source}
                  </span>
                  <span className="font-mono text-xs text-zinc-400">
                    ⭐ {topic.score ?? 0}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors leading-snug">
                  {topic.title}
                </h3>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-[#232328] pt-3.5">
                {topic.url ? (
                  <a
                    href={topic.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white hover:underline"
                  >
                    View Source <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-[11px] text-zinc-500 font-mono">Trending Feed</span>
                )}

                <Button
                  size="sm"
                  onClick={() => navigate('/generate', { state: { topic: topic.title } })}
                  className="rounded-full bg-primary text-xs font-medium text-white hover:bg-primary/90"
                >
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
