import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, CalendarClock, CheckCheck, Globe, Clock, PenLine } from 'lucide-react'
import type { CrawlerTopic } from '@shared/types'
import { usePosts } from '@/renderer/store'
import { api } from '@/renderer/lib/api'
import { familyOf } from '@/renderer/lib/topics'
import { Button } from '@/renderer/components/ui/button'
import { ErrorBanner } from '@/renderer/components/ErrorBanner'

export default function Dashboard() {
  const navigate = useNavigate()
  const { posts, load } = usePosts()
  const [topics, setTopics] = useState<CrawlerTopic[]>([])
  const [topicsError, setTopicsError] = useState<string | null>(null)

  const loadTopics = () => {
    setTopicsError(null)
    api
      .fetchTopics()
      .then((t) => setTopics(t))
      .catch((e) => setTopicsError((e as Error).message || 'Failed to load topics'))
  }

  useEffect(() => {
    load()
    loadTopics()
    // The scheduler promotes scheduled posts periodically — refresh the
    // topic card on the same beat so every card stays live.
    const off = window.postly?.on?.('scheduler:tick', () => {
      void load()
      loadTopics()
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  const draftsCount = posts.filter((p) => p.status === 'draft' || p.status === 'pending').length
  const readyCount = posts.filter((p) => p.status === 'pending').length
  const scheduledPosts = posts
    .filter((p) => p.status === 'scheduled' && p.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
  const donePosts = posts.filter((p) => p.status === 'posted' && p.postedAt)
  const doneCount = donePosts.length
  const lastDone = donePosts.reduce<Date | null>(
    (latest, p) => (!latest || new Date(p.postedAt!) > latest ? new Date(p.postedAt!) : latest),
    null
  )
  const platformCount = new Set(topics.map((t) => familyOf(t.source))).size

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-200">
      {/* Actions row — the page title now lives in the top navbar, so the body
          header only holds the primary actions (right-aligned). */}
      <div className="flex items-center justify-end gap-2.5">
        <Button variant="flat" size="sm" onClick={() => navigate('/drafts')}>
          <FileText className="mr-1.5 h-3.5 w-3.5" /> View Drafts ({draftsCount})
        </Button>
        <Button size="sm" onClick={() => navigate('/write')}>
          <PenLine className="mr-1.5 h-3.5 w-3.5" /> Write New Post
        </Button>
      </div>

      {topicsError && <ErrorBanner message={topicsError} onRetry={loadTopics} />}

      {/* 4 Stat Cards — simple wording, one number, one live sub-line */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'My Drafts',
            icon: FileText,
            value: draftsCount,
            onClick: () => navigate('/drafts'),
            footer: readyCount > 0 ? `${readyCount} ready to post` : 'nothing waiting'
          },
          {
            label: 'Scheduled',
            icon: CalendarClock,
            value: scheduledPosts.length,
            onClick: () => navigate('/calendar'),
            footer: scheduledPosts[0]
              ? `Next: ${new Date(scheduledPosts[0].scheduledAt!).toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}`
              : 'nothing scheduled'
          },
          {
            label: 'Done',
            icon: CheckCheck,
            value: doneCount,
            onClick: () => navigate('/drafts'),
            footer: lastDone
              ? `last one ${lastDone.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
              : 'nothing yet'
          },
          {
            label: 'Live Topics',
            icon: Globe,
            value: topics.length,
            onClick: () => navigate('/topics'),
            footer: `from ${platformCount} platform${platformCount === 1 ? '' : 's'}`
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

      {/* Upcoming scheduled posts — time / platform / description only */}
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
            <p className="text-sm font-medium text-foreground">No upcoming posts</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Write a post and set a future date to see it here and on the Calendar.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {scheduledPosts.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="group flex flex-col justify-between rounded-[14px] border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
              >
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
