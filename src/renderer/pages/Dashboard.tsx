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
  Star
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
    api.accountsStatus().then(setAccountStatuses).catch(() => { })
  }, [load])

  const draftsCount = posts.filter((p) => p.status === 'draft' || p.status === 'pending').length
  const scheduledPosts = posts
    .filter((p) => p.status === 'scheduled' && p.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
  const postedCount = posts.filter((p) => p.status === 'posted').length

  const accountFor = (s: AccountSource) => accountStatuses.find((a) => a.source === s)
  const OFF_BADGE = 'border-border bg-secondary/60 text-muted-foreground'
  const accountBadge = (label: string, s: AccountSource, onColor: string) => {
    const on = accountFor(s)?.connected
    return { label: `${label} ${on ? 'Connected' : 'Not connected'}`, color: on ? onColor : OFF_BADGE }
  }

  // Personal-account badges reflect the REAL accounts:status result; the rest are
  // always-on public sources labelled honestly (no fake "Ready" claims).
  const platformBadges = [
    accountBadge('X', 'x', 'border-sky-500/30 bg-sky-500/10 text-sky-400'),
    accountBadge('LinkedIn', 'linkedin', 'border-blue-500/30 bg-blue-500/10 text-blue-400'),
    accountBadge('Reddit', 'reddit', 'border-orange-500/30 bg-orange-500/10 text-orange-400'),
    accountBadge('GitHub', 'github', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'),
    { label: 'Instagram Active', color: 'border-pink-500/30 bg-pink-500/10 text-pink-400' },
    { label: 'Hacker News Active', color: 'border-orange-500/30 bg-orange-500/10 text-orange-400' },
    { label: 'YouTube Active', color: 'border-red-500/30 bg-red-500/10 text-red-400' },
    { label: 'Bluesky Active', color: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' }
  ]


  const connectedNames = accountStatuses
    .filter((a) => a.connected)
    .map((a) => (a.source === 'x' ? 'X' : a.source === 'linkedin' ? 'LinkedIn' : a.source === 'reddit' ? 'Reddit' : 'GitHub'))

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
      {/* Header — MasterJi: 22px medium h1 + zinc-500 subtitle, actions right */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your daily AI & dev-content pipeline, live web topics, and scheduled posts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="flat" size="sm" onClick={() => navigate('/drafts')}>
            <FileText className="mr-1 h-3.5 w-3.5" /> View Drafts ({draftsCount})
          </Button>
          <Button size="sm" onClick={() => navigate('/generate')}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Generate New Post
          </Button>
        </div>
      </div>

      {/* Live crawler notice strip — MasterJi notice-card style (flat, amber status dot) */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-[14px] border border-border bg-card px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">
              Live Topic Crawlers Active: Hacker News, daily.dev, YouTube & Agent Reach
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-warning" />
                Ranked by relevance + engagement
              </span>
              <span>
                {connectedNames.length
                  ? `• ${connectedNames.length} personal account${connectedNames.length > 1 ? 's' : ''} connected: ${connectedNames.join(', ')}`
                  : '• Connect X / LinkedIn / Reddit in Settings for personalized feeds'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
          <Button variant="flat" size="sm" onClick={() => navigate('/topics')}>
            Explore Topics
          </Button>
          <Button size="sm" onClick={() => navigate('/generate')}>
            <span>Generate Now</span>
            <Sparkles className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {topicsError && <ErrorBanner message={topicsError} onRetry={loadTopics} />}

      {/* 4 Stat Cards — Montserrat title, Palanquin number, 12px footer */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Drafts Pipeline',
            icon: FileText,
            value: draftsCount,
            onClick: () => navigate('/drafts'),
            footer: (
              <>
                <span>{draftsCount} In Pipeline</span>
                <span>•</span>
                <span>Needs Review</span>
              </>
            )
          },
          {
            label: 'Scheduled Posts',
            icon: CalendarClock,
            value: scheduledPosts.length,
            onClick: () => navigate('/calendar'),
            footer: (
              <>
                <span className="font-medium text-primary">{scheduledPosts.length} Scheduled</span>
                <span>•</span>
                <span>Sync with GCal</span>
              </>
            )
          },
          {
            label: 'Published Posts',
            icon: CheckCheck,
            value: postedCount,
            onClick: () => navigate('/drafts'),
            footer: (
              <>
                <span className="font-medium text-emerald-500">{postedCount} Live Posts</span>
                <span>•</span>
                <span>All Channels</span>
              </>
            )
          },
          {
            label: 'Crawler Topics',
            icon: Globe,
            value: topics.length,
            onClick: () => navigate('/topics'),
            footer: (
              <>
                <span className="font-medium text-primary">{topics.length} Fresh Topics</span>
                <span>•</span>
                <span>Hacker News/Reddit</span>
              </>
            )
          }
        ].map((card) => (
          <div
            key={card.label}
            onClick={card.onClick}
            className="group cursor-pointer rounded-[14px] border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
          >
            <div className="flex items-start justify-between">
              <h3 className="font-title text-xl font-medium leading-7 tracking-tight text-foreground">{card.label}</h3>
              <card.icon className="mt-1 h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <div className="mt-2 px-1 font-num text-4xl font-medium leading-10 text-foreground">{card.value}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">{card.footer}</div>
          </div>
        ))}
      </div>

      {/* Platform Readiness Chips */}
      <div className="flex flex-wrap gap-2.5 pt-1">
        {platformBadges.map((badge, idx) => (
          <div
            key={idx}
            className={`cursor-pointer rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${badge.color}`}
          >
            {badge.label}
          </div>
        ))}
      </div>

      {/* Scheduled Posts with Google Calendar Sync */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-medium tracking-tight text-foreground">Upcoming Scheduled Posts</h2>
            <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
              {scheduledPosts.length}
            </span>
          </div>
          <Button variant="flat" size="sm" onClick={() => navigate('/calendar')}>
            <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
            Open Content Calendar
          </Button>
        </div>

        {scheduledPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-500/40 py-12 text-center">
            <CalendarClock className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No upcoming deadlines</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate a post and set a future publish date to see it here and sync with Google Calendar.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {scheduledPosts.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="group flex flex-col justify-between rounded-[14px] border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
              >
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium text-primary">
                      <Clock className="h-3.5 w-3.5" /> {new Date(item.scheduledAt!).toLocaleString()}
                    </span>
                    <span className="rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                      {item.platforms.join(', ') || 'No Platform'}
                    </span>
                  </div>
                  <h3 className="line-clamp-1 text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                    {item.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-[11px] capitalize text-muted-foreground">
                    Style: {item.style || 'Educational'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownloadIcs(item)}
                      title="Download .ics for Apple/Outlook/Google"
                      className="rounded-full bg-zinc-700/40 px-2.5 py-1 text-[11px] text-zinc-700 transition-colors hover:bg-zinc-700/60 dark:text-zinc-200"
                    >
                      .ics
                    </button>
                    <Button variant="flat" size="sm" onClick={() => handleSyncToGoogle(item)}>
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
            <h2 className="text-2xl font-medium tracking-tight text-foreground">Trending Topic Radar</h2>
            <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
              {topics.length}
            </span>
          </div>
          <Button variant="flat" size="sm" onClick={() => navigate('/topics')}>
            View All Crawled Topics
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topics.slice(0, 6).map((topic, i) => {
            const s = topic.source.toLowerCase()
            const badgeCls = s.startsWith('github')
              ? 'bg-emerald-500/10 text-emerald-400'
              : s.startsWith('reddit')
                ? 'bg-orange-500/10 text-orange-400'
                : s.startsWith('x') || s === 'twitter'
                  ? 'bg-sky-500/10 text-sky-400'
                  : s.startsWith('linkedin')
                    ? 'bg-blue-500/10 text-blue-400'
                    : s.startsWith('instagram')
                      ? 'bg-pink-500/10 text-pink-400'
                      : s.startsWith('youtube')
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-secondary/60 text-muted-foreground'

            return (
              <div
                key={i}
                className="group flex flex-col justify-between rounded-[14px] border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
              >
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${badgeCls}`}>
                      {topic.source}
                    </span>
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Star className="h-3 w-3" /> {topic.score ?? 0}
                    </span>
                  </div>
                  <h3 className="line-clamp-2 text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                    {topic.title}
                  </h3>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  {topic.url ? (
                    <button
                      type="button"
                      onClick={() => api.openExternal(topic.url!)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      View Reference <ExternalLink className="h-3 w-3" />
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Live Feed</span>
                  )}
                  <Button size="sm" onClick={() => navigate('/generate', { state: { topic: topic.title } })}>
                    <Sparkles className="mr-1 h-3 w-3" /> Draft Post
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
