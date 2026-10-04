import { Bell, ExternalLink, X, Megaphone, Calendar, Trophy, Sparkles, Flame, Cpu, Radio } from 'lucide-react'
import { Button } from './ui/button'

interface NoticeBoardModalProps {
  onClose: () => void
}

export function NoticeBoardModal({ onClose }: NoticeBoardModalProps) {
  const notices = [
    {
      id: 1,
      tag: 'Trending AI',
      tagColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      title: 'Llama 3.3 70B & DeepSeek R1 Trends Surging',
      date: 'Today · Hacker News #1',
      body: 'High engagement across Hacker News and Reddit. Perfect topic for educational and hot-take multi-platform social posts.',
      link: '#/generate',
      linkText: 'Draft Post Now',
      isNew: true
    },
    {
      id: 2,
      tag: 'Crawler Status',
      tagColor: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      title: 'Agent Reach & daily.dev Crawlers Synchronized',
      date: 'Live Feed',
      body: 'Algolia Hacker News, Reddit PRAW, YouTube yt-dlp, and RSS channels probed and ready for automated topic aggregation.',
      link: '#/topics',
      linkText: 'View Topic Radar',
      isNew: false
    },
    {
      id: 3,
      tag: 'Google Calendar',
      tagColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      title: '1-Click Google Calendar Synchronization Ready',
      date: 'Feature Enabled',
      body: 'All scheduled drafts and content deadlines now sync directly to your personal Google Calendar or export as .ics files.',
      link: '#/calendar',
      linkText: 'Open Content Calendar',
      isNew: false
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-2xl border border-[#27272a] bg-[#141416] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#232328] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Notice Board
                <span className="flex h-5 items-center justify-center rounded-full bg-primary px-2 text-[11px] font-bold text-white">
                  3 Updates
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">Trending tech alerts, crawler feeds and pipeline status</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 max-h-[60vh] space-y-3.5 overflow-y-auto pr-1">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className="group relative rounded-xl border border-[#26262b] bg-[#18181c] p-4 transition-all hover:border-primary/40 hover:bg-[#1c1c21]"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${notice.tagColor}`}>
                  {notice.tag}
                </span>
                <span className="text-xs text-muted-foreground font-mono">{notice.date}</span>
              </div>
              <h3 className="font-semibold text-sm text-zinc-100 group-hover:text-primary transition-colors">
                {notice.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">{notice.body}</p>
              <div className="mt-3 flex items-center justify-end">
                <a
                  href={notice.link}
                  target={notice.link.startsWith('http') ? '_blank' : '_self'}
                  rel="noreferrer"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  {notice.linkText}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end border-t border-[#232328] pt-4">
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl border-[#2a2a30] text-zinc-300 hover:bg-white/5">
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
