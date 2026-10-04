import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Flame,
  FileText,
  CalendarClock,
  CheckCheck,
  Globe,
  Sparkles,
  ExternalLink,
  Clock,
  CalendarPlus,
  RefreshCw,
  Zap,
  Layers,
  Send,
  Cpu
} from 'lucide-react'
import type { CrawlerTopic, PostRecord, AccountStatus, AccountSource } from '@shared/types'
import { usePosts } from '@/renderer/store'
import { api } from '@/renderer/lib/api'
import { Button } from '@/renderer/components/ui/button'
import { ErrorBanner } from '@/renderer/components/ErrorBanner'
import { createGoogleCalendarUrl, downloadIcsFile, type CalendarEvent } from '@/renderer/lib/calendar'
import { toast } from 'sonner'

export default function Dashboard() {
  const navigate = useNavigate()
  const { posts, load } = usePosts()
  const [topics, setTopics] = useState<CrawlerTopic[]>([])
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [topicsError, setTopicsError] = useState<string | null>(null)
  const [accountStatuses, setAccountStatuses] = useState<AccountStatus[]>([])

  const loadTopics = () => {
    setLoadingTopics(true)
    setTopicsError(null)
    api
      .fetchTopics()
      .then((t) => setTopics(t.slice(0, 8)))
      .catch((e) => setTopicsError((e as Error).message || 'Failed to load topics'))
      .finally(() => setLoadingTopics(false))
  }

  useEffect(() => {
    load()
    loadTopics()
    api.accountsStatus().then(setAccountStatuses).catch(() => {})
  }, [load])

  const draftsCount = posts.filter((p) => p.status === 'draft' || p.status === 'pending').length
  const scheduledPosts = posts
    .filter((p) => p.status === 'scheduled' && p.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
  const postedCount = posts.filter((p) => p.status === 'posted').length

  const accountFor = (s: AccountSource) => accountStatuses.find((a) => a.source === s)
  const OFF_BADGE = 'bg-zinc-800/60 text-zinc-400 border-zinc-700/40'
  const accountBadge = (label: string, s: AccountSource, onColor: string) => {
    const on = accountFor(s)?.connected
    return { label: `${label} ${on ? 'Connected' : 'Not connected'}`, color: on ? onColor : OFF_BADGE }
  }

  // Personal-account badges reflect the REAL accounts:status result; the rest are
  // always-on public sources labelled honestly (no fake "Ready" claims).
  const platformBadges = [
    accountBadge('X', 'x', 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'),
    accountBadge('LinkedIn', 'linkedin', 'bg-sky-950/60 text-sky-400 border-sky-800/40'),
    accountBadge('Reddit', 'reddit', 'bg-amber-950/60 text-amber-400 border-amber-800/40'),
    { label: 'Hacker News Active', color: 'bg-orange-950/60 text-orange-400 border-orange-800/40' },
    { label: 'daily.dev Active', color: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/50' },
    { label: 'YouTube Active', color: 'bg-red-950/60 text-red-400 border-red-800/40' },
    { label: 'AI Router Active', color: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/50' }
  ]

  const connectedNames = accountStatuses
    .filter((a) => a.connected)
    .map((a) => (a.source === 'x' ? 'X' : a.source === 'linkedin' ? 'LinkedIn' : 'Reddit'))

  const handleSyncToGoogle = (post: PostRecord) => {
    const calEvt: CalendarEvent = {
      id: post.id,
      title: `Publish: ${post.title}`,
      description: `${post.description}\nPlatforms: ${post.platforms.join(', ')}`,
      startDate: post.scheduledAt ? post.scheduledAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      startTime: post.scheduledAt ? post.scheduledAt.slice(11, 16) : '12:00',
      category: 'project',
      location: post.platforms.join(', ') || 'Social Platforms'
    }
    const url = createGoogleCalendarUrl(calEvt)
    window.open(url, '_blank')
    toast.success(`Opening Google Calendar for "${post.title}"`)
  }

  const handleDownloadIcs = (post: PostRecord) => {
    const calEvt: CalendarEvent = {
      id: post.id,
      title: `Publish: ${post.title}`,
      description: `${post.description}\nPlatforms: ${post.platforms.join(', ')}`,
      startDate: post.scheduledAt ? post.scheduledAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      startTime: post.scheduledAt ? post.scheduledAt.slice(11, 16) : '12:00',
      category: 'project',
      location: post.platforms.join(', ') || 'Social Platforms'
    }
    downloadIcsFile(calEvt)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your daily AI & dev-content pipeline, live web topics, and scheduled posts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => navigate('/drafts')}
            className="rounded-full border-[#2a2a30] text-zinc-300 hover:border-primary/40 hover:text-white"
          >
            <FileText className="mr-1.5 h-4 w-4" /> View Drafts ({draftsCount})
          </Button>
          <Button
            onClick={() => navigate('/generate')}
            className="rounded-full bg-primary font-medium text-white shadow-lg hover:bg-primary/90"
          >
            <Sparkles className="mr-1.5 h-4 w-4" /> Generate New Post
          </Button>
        </div>
      </div>

      {/* Green Announcement Banner */}
      <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-2xl border border-[#14532d] bg-[#052e16]/80 px-5 py-4 backdrop-blur shadow-lg transition-all hover:border-emerald-500/40">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <Flame className="h-5 w-5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-emerald-300">
              Live Topic Crawlers Active: Hacker News, daily.dev, YouTube & Agent Reach
            </h3>
            <p className="text-xs text-emerald-500/90 font-medium flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span>⚡ Ranked by relevance + engagement</span>
              <span>
                {connectedNames.length
                  ? `• ${connectedNames.length} personal account${connectedNames.length > 1 ? 's' : ''} connected: ${connectedNames.join(', ')}`
                  : '• Connect X / LinkedIn / Reddit in Settings for personalized feeds'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate('/topics')}
            className="h-8 rounded-full border border-emerald-700/50 bg-emerald-950/60 px-3.5 text-xs font-medium text-emerald-200 hover:bg-emerald-800/50 hover:text-white"
          >
            Explore Topics
          </Button>
          <Button
            size="sm"
            onClick={() => navigate('/generate')}
            className="h-8 rounded-full bg-emerald-600 px-3.5 text-xs font-medium text-white shadow transition-colors hover:bg-emerald-500"
          >
            <span>Generate Now</span>
            <Sparkles className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {topicsError && <ErrorBanner message={topicsError} onRetry={loadTopics} />}

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Drafts Pipeline */}
        <div
          onClick={() => navigate('/drafts')}
          className="group relative cursor-pointer rounded-2xl border border-[#232328] bg-[#141417] p-5 transition-all hover:border-[#f06e1e]/40 hover:bg-[#18181c]"
        >
          <div className="flex items-start justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Drafts Pipeline</h3>
            <FileText className="h-5 w-5 text-zinc-400 group-hover:text-primary transition-colors" />
          </div>
          <div className="mt-4 font-mono text-4xl font-bold text-white tracking-tight">
            {draftsCount}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{draftsCount} In Pipeline</span>
            <span>•</span>
            <span className="text-zinc-400">Needs Review</span>
          </div>
        </div>

        {/* Scheduled Posts */}
        <div
          onClick={() => navigate('/calendar')}
          className="group relative cursor-pointer rounded-2xl border border-[#232328] bg-[#141417] p-5 transition-all hover:border-[#f06e1e]/40 hover:bg-[#18181c]"
        >
          <div className="flex items-start justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Scheduled Posts</h3>
            <CalendarClock className="h-5 w-5 text-zinc-400 group-hover:text-primary transition-colors" />
          </div>
          <div className="mt-4 font-mono text-4xl font-bold text-white tracking-tight">
            {scheduledPosts.length}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-orange-400 font-semibold">{scheduledPosts.length} Scheduled</span>
            <span>•</span>
            <span className="text-zinc-400">Sync with GCal</span>
          </div>
        </div>

        {/* Published Posts */}
        <div
          onClick={() => navigate('/drafts')}
          className="group relative cursor-pointer rounded-2xl border border-[#232328] bg-[#141417] p-5 transition-all hover:border-[#f06e1e]/40 hover:bg-[#18181c]"
        >
          <div className="flex items-start justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Published Posts</h3>
            <CheckCheck className="h-5 w-5 text-zinc-400 group-hover:text-primary transition-colors" />
          </div>
          <div className="mt-4 font-mono text-4xl font-bold text-white tracking-tight">
            {postedCount}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-400 font-medium">{postedCount} Live Posts ✓</span>
            <span>•</span>
            <span className="text-zinc-400">All Channels</span>
          </div>
        </div>

        {/* Crawled Topics */}
        <div
          onClick={() => navigate('/topics')}
          className="group relative cursor-pointer rounded-2xl border border-[#232328] bg-[#141417] p-5 transition-all hover:border-[#f06e1e]/40 hover:bg-[#18181c]"
        >
          <div className="flex items-start justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Crawler Topics</h3>
            <Globe className="h-5 w-5 text-zinc-400 group-hover:text-primary transition-colors" />
          </div>
          <div className="mt-4 font-mono text-4xl font-bold text-white tracking-tight">
            {topics.length}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-primary font-medium">{topics.length} Fresh Topics</span>
            <span>•</span>
            <span className="text-zinc-400">Hacker News/Reddit</span>
          </div>
        </div>
      </div>

      {/* Platform Readiness Chips */}
      <div className="flex flex-wrap gap-2.5 pt-1">
        {platformBadges.map((badge, idx) => (
          <div
            key={idx}
            className={`cursor-pointer rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide transition-all ${badge.color}`}
          >
            {badge.label}
          </div>
        ))}
      </div>

      {/* Scheduled Posts with Google Calendar Sync */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-white">Upcoming Scheduled Posts</h2>
            <span className="rounded-full bg-primary/20 px-2.5 py-0.5 font-mono text-xs font-bold text-primary">
              {scheduledPosts.length}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/calendar')}
            className="rounded-full border-[#2a2a30] text-xs hover:border-primary/40 hover:text-primary"
          >
            <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
            Open Content Calendar
          </Button>
        </div>

        {scheduledPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[#232328] bg-[#141417] py-12 text-center">
            <CalendarClock className="h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-sm font-medium text-zinc-400">No scheduled posts yet</p>
            <p className="text-xs text-zinc-600 mt-1">
              Generate a post and set a future publish date to see it here and sync with Google Calendar.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {scheduledPosts.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-[#232328] bg-[#141417] p-4 transition-all hover:border-primary/40 hover:bg-[#18181c]"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span className="font-mono text-orange-400 font-semibold flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> {new Date(item.scheduledAt!).toLocaleString()}
                    </span>
                    <span className="rounded-full border border-zinc-700/40 bg-zinc-800/60 px-2 py-0.5 capitalize text-[11px] text-zinc-300">
                      {item.platforms.join(', ') || 'No Platform'}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-white group-hover:text-primary transition-colors line-clamp-1">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{item.description}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#232328] pt-3">
                  <span className="text-[11px] text-zinc-500 font-mono capitalize">
                    Style: {item.style || 'Educational'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownloadIcs(item)}
                      title="Download .ics for Apple/Outlook/Google"
                      className="rounded-lg border border-[#2c2c34] px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                    >
                      .ics
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSyncToGoogle(item)}
                      className="h-7 rounded-full border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary hover:text-white"
                    >
                      <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                      Add to Google Calendar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trending Topic Suggestions from Crawlers */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-white">Trending Topic Radar</h2>
            <span className="rounded-full bg-primary/20 px-2.5 py-0.5 font-mono text-xs font-bold text-primary">
              {topics.length}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/topics')}
            className="rounded-full border-[#2a2a30] text-xs hover:border-primary/40"
          >
            View All Crawled Topics
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topics.slice(0, 6).map((topic, i) => (
            <div
              key={i}
              className="group flex flex-col justify-between rounded-2xl border border-[#232328] bg-[#141417] p-4 transition-all hover:border-primary/40 hover:bg-[#18181c]"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span className="font-semibold text-orange-400 capitalize">{topic.source}</span>
                  <span className="font-mono text-zinc-400">⭐ {topic.score ?? 0}</span>
                </div>
                <h3 className="font-semibold text-sm text-white group-hover:text-primary transition-colors line-clamp-2">
                  {topic.title}
                </h3>
              </div>

              <div className="mt-4 flex items-center justify-end border-t border-[#232328] pt-3">
                <Button
                  size="sm"
                  onClick={() => navigate('/generate', { state: { topic: topic.title } })}
                  className="rounded-full bg-primary/20 text-primary border border-primary/30 text-xs hover:bg-primary hover:text-white"
                >
                  <Sparkles className="mr-1 h-3 w-3" /> Draft Post
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
