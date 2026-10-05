import { useState, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarPlus,
  Download,
  Clock,
  MapPin,
  ExternalLink,
  CalendarDays,
  CheckCircle2
} from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { usePosts } from '@/renderer/store'
import {
  createGoogleCalendarUrl,
  downloadIcsFile,
  type CalendarEvent
} from '@/renderer/lib/calendar'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

export default function CalendarPage() {
  const navigate = useNavigate()
  const { posts, load } = usePosts()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [view, setView] = useState<'month' | 'agenda'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [showAddModal, setShowAddModal] = useState(false)

  // New Event Form State
  const [newEvent, setNewEvent] = useState<Partial<CalendarEvent>>({
    title: '',
    description: '',
    startDate: new Date().toISOString().slice(0, 10),
    startTime: '10:00',
    category: 'live-class',
    location: 'X / LinkedIn / Instagram'
  })

  useEffect(() => {
    load()
  }, [load])

  // Map scheduled posts from store into Calendar events
  useEffect(() => {
    const postEvents: CalendarEvent[] = posts
      .filter((p) => p.scheduledAt)
      .map((p) => ({
        id: `post-${p.id}`,
        title: `[Postly] ${p.title}`,
        description: `${p.description}\n\nPlatforms: ${p.platforms.join(', ')}`,
        startDate: p.scheduledAt!.slice(0, 10),
        startTime: p.scheduledAt!.slice(11, 16),
        category: 'project',
        location: p.platforms.join(', ') || 'Social Platforms',
        syncedToGoogle: true
      }))

    const defaultEvents: CalendarEvent[] = [
      {
        id: 'evt-1',
        title: 'Weekly AI & Tech News Roundup Post',
        description: 'Publish weekly curated top AI agent developments to LinkedIn & X.',
        location: 'LinkedIn · X',
        startDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
        startTime: '10:00',
        endTime: '11:00',
        category: 'live-class'
      },
      {
        id: 'evt-2',
        title: 'Daily.dev & Hacker News Trend Analysis',
        description: 'Scrape and rank top trending repos for tomorrow morning social thread.',
        location: 'Postly Topic Radar',
        startDate: new Date(Date.now() + 86400000 * 4).toISOString().slice(0, 10),
        startTime: '18:00',
        endTime: '19:00',
        category: 'dsa'
      }
    ]

    setEvents([...postEvents, ...defaultEvents])
  }, [posts])

  // Date math
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToToday = () => setCurrentDate(new Date())

  const filteredEvents = events.filter((e) => {
    if (selectedCategory !== 'all' && e.category !== selectedCategory) return false
    return true
  })

  const handleAddToGoogleCalendar = (evt: CalendarEvent) => {
    const url = createGoogleCalendarUrl(evt)
    window.open(url, '_blank')
    toast.success(`Opening Google Calendar to save: ${evt.title}`)
  }

  const handleSyncAllToGoogle = () => {
    if (events.length > 0) {
      const nextEvt = events[0]
      const url = createGoogleCalendarUrl(nextEvt)
      window.open(url, '_blank')
      toast.success('Syncing content calendar with Google Calendar!')
    }
  }

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEvent.title || !newEvent.startDate) {
      toast.error('Please enter title and date')
      return
    }

    const created: CalendarEvent = {
      id: `evt-${Date.now()}`,
      title: newEvent.title,
      description: newEvent.description || '',
      startDate: newEvent.startDate,
      startTime: newEvent.startTime || '10:00',
      category: (newEvent.category as any) || 'general',
      location: newEvent.location || 'Social Channels',
      syncedToGoogle: false
    }

    setEvents((prev) => [created, ...prev])
    setShowAddModal(false)
    toast.success('Scheduled calendar item created!')

    toast.message('Push to Google Calendar?', {
      action: {
        label: 'Add to GCal',
        onClick: () => handleAddToGoogleCalendar(created)
      }
    })

    setNewEvent({
      title: '',
      description: '',
      startDate: new Date().toISOString().slice(0, 10),
      startTime: '10:00',
      category: 'live-class',
      location: 'X / LinkedIn / Instagram'
    })
  }

  const categoryBadgeColors: Record<string, string> = {
    'town-hall': 'bg-purple-500/15 text-purple-400',
    'live-class': 'bg-emerald-500/15 text-emerald-500',
    'hackathon': 'bg-primary/15 text-primary',
    'project': 'bg-blue-500/15 text-blue-400',
    'dsa': 'bg-warning/15 text-warning',
    'general': 'bg-secondary/60 text-muted-foreground'
  }

  const fieldCls =
    'w-full rounded-lg border border-input bg-zinc-800/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary/50'

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in fade-in duration-200">
      {/* Header — MasterJi 22px medium h1 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-[22px] font-medium tracking-tight text-foreground">
            Calendar & Schedule
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Google Calendar Sync
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visual calendar for scheduled social posts, content releases and 1-click Google Calendar integration.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button size="sm" onClick={handleSyncAllToGoogle}>
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
            Sync with Google Calendar
          </Button>
          <Button variant="flat" size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Schedule Event
          </Button>
        </div>
      </div>

      {/* Google Calendar Integration Card — flat MasterJi card */}
      <div className="rounded-[14px] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-title text-base font-medium tracking-tight text-foreground">Google Calendar Auto-Sync</h3>
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
                  READY
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Every scheduled post and content reminder creates a 1-click Google Calendar event with pre-filled title, body, and time.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-center">
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-zinc-700/40 px-3.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-700/60 dark:text-zinc-200"
            >
              <span>Open Google Calendar</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Controls & Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Button variant="flat" size="icon" onClick={prevMonth} className="h-8 w-8 rounded-full">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 font-title text-base font-medium text-foreground">
            {monthNames[month]} {year}
          </span>
          <Button variant="flat" size="icon" onClick={nextMonth} className="h-8 w-8 rounded-full">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToToday} className="text-xs">
            Today
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-secondary/50 p-1 text-xs">
            <button
              onClick={() => setView('month')}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                view === 'month' ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Month View
            </button>
            <button
              onClick={() => setView('agenda')}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                view === 'agenda' ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Agenda List
            </button>
          </div>
        </div>
      </div>

      {/* Main View */}
      {view === 'month' ? (
        <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-border bg-secondary/30 py-2.5 text-center text-xs font-medium text-muted-foreground">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 auto-rows-[115px] divide-x divide-y divide-border">
            {/* Blank leading days */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`blank-${i}`} className="p-2 text-muted-foreground/40"></div>
            ))}

            {/* Days of Month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1
              const dayString = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
              const dayEvents = filteredEvents.filter((e) => e.startDate === dayString)
              const isToday =
                new Date().getDate() === dayNum &&
                new Date().getMonth() === month &&
                new Date().getFullYear() === year

              return (
                <div
                  key={`day-${dayNum}`}
                  className={`flex flex-col justify-between p-2 transition-colors hover:bg-white/[0.02] ${
                    isToday ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                        isToday ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground/80'
                      }`}
                    >
                      {dayNum}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                    )}
                  </div>

                  <div className="mt-1 space-y-1 overflow-y-auto max-h-[75px]">
                    {dayEvents.map((evt) => (
                      <div
                        key={evt.id}
                        onClick={() => handleAddToGoogleCalendar(evt)}
                        title={`Click to Add "${evt.title}" to Google Calendar`}
                        className="cursor-pointer truncate rounded-md bg-secondary/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                      >
                        {evt.startTime && <span className="mr-1 text-primary">{evt.startTime}</span>}
                        {evt.title}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Agenda / List View */
        <div className="space-y-3">
          {filteredEvents.map((evt) => (
            <div
              key={evt.id}
              className="group flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-[14px] border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      categoryBadgeColors[evt.category] || categoryBadgeColors.general
                    }`}
                  >
                    {evt.category.replace('-', ' ')}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-primary">
                    <Clock className="h-3 w-3" />
                    {evt.startDate} {evt.startTime && `· ${evt.startTime}`}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                  {evt.title}
                </h3>
                {evt.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{evt.description}</p>
                )}
                {evt.location && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {evt.location}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <button
                  onClick={() => downloadIcsFile(evt)}
                  className="rounded-full bg-zinc-700/40 px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-700/60 dark:text-zinc-200"
                >
                  <Download className="mr-1 inline-block h-3.5 w-3.5" />
                  .ics
                </button>
                <Button size="sm" onClick={() => handleAddToGoogleCalendar(evt)}>
                  <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                  Add to Google Calendar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-medium tracking-tight text-foreground">Schedule Content & Event</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Add a social publishing schedule or content milestone and sync to Google Calendar.
            </p>

            <form onSubmit={handleCreateEvent} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">Schedule Title *</label>
                <input
                  type="text"
                  required
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="e.g. Publish DeepSeek R1 Analysis Thread"
                  className={fieldCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">Date *</label>
                  <input
                    type="date"
                    required
                    value={newEvent.startDate}
                    onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">Time</label>
                  <input
                    type="time"
                    value={newEvent.startTime}
                    onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                    className={fieldCls}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">Platforms / Target</label>
                <input
                  type="text"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  placeholder="X, LinkedIn, Threads, Instagram"
                  className={fieldCls}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">Notes / Description</label>
                <textarea
                  rows={3}
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Key talking points, hashtags, attachments..."
                  className={fieldCls}
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <Button type="button" variant="flat" size="sm" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save & Sync
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
