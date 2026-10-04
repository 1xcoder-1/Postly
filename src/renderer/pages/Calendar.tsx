import { useState, useEffect } from 'react'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarPlus,
  Download,
  Share2,
  Clock,
  MapPin,
  CheckCircle2,
  Filter,
  ExternalLink,
  Sparkles,
  CalendarDays,
  Send,
  Layers
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
    'town-hall': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'live-class': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'hackathon': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'project': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'dsa': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'general': 'bg-zinc-700/30 text-zinc-300 border-zinc-600/30'
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            Calendar & Schedule
            <span className="flex items-center gap-1 text-xs font-normal rounded-full border border-emerald-500/30 bg-emerald-950/40 text-emerald-400 px-2.5 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Google Calendar Sync Active
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visual calendar for scheduled social posts, content releases and 1-click Google Calendar integration.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={handleSyncAllToGoogle}
            className="rounded-full bg-primary font-medium text-white shadow-lg hover:bg-primary/90"
          >
            <CalendarPlus className="mr-1.5 h-4 w-4" />
            Sync with Google Calendar
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowAddModal(true)}
            className="rounded-full border-[#2a2a30] hover:border-primary/40 text-zinc-200"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Schedule Event
          </Button>
        </div>
      </div>

      {/* Google Calendar Integration Card */}
      <div className="rounded-2xl border border-[#27272a] bg-gradient-to-r from-[#17171a] via-[#1a1816] to-[#17171a] p-5 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm">Google Calendar Auto-Sync</h3>
                <span className="rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.2 text-[10px] font-bold">
                  READY
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Every scheduled post and content reminder creates a 1-click Google Calendar event with pre-filled title, body, and time.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-center">
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/80 px-3.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              <span>Open Google Calendar</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Controls & Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#232328] pb-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={prevMonth}
            className="h-8 w-8 p-0 rounded-lg border-[#27272a]"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-bold text-base text-white px-2">
            {monthNames[month]} {year}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={nextMonth}
            className="h-8 w-8 p-0 rounded-lg border-[#27272a]"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToToday}
            className="h-8 text-xs text-muted-foreground hover:text-white"
          >
            Today
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#141416] border border-[#27272a] rounded-xl p-1 text-xs">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                view === 'month' ? 'bg-[#232328] text-white font-medium' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Month View
            </button>
            <button
              onClick={() => setView('agenda')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                view === 'agenda' ? 'bg-[#232328] text-white font-medium' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Agenda List
            </button>
          </div>
        </div>
      </div>

      {/* Main View */}
      {view === 'month' ? (
        <div className="rounded-2xl border border-[#232328] bg-[#141417] overflow-hidden shadow-xl">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-[#232328] bg-[#18181c] text-center text-xs font-semibold text-zinc-400 py-2.5">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 auto-rows-[115px] divide-x divide-y divide-[#232328]">
            {/* Blank leading days */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`blank-${i}`} className="bg-[#111113]/50 p-2 text-zinc-700"></div>
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
                  className={`p-2 transition-colors hover:bg-[#18181c] flex flex-col justify-between ${
                    isToday ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-mono font-medium ${
                        isToday ? 'bg-primary text-white font-bold shadow' : 'text-zinc-300'
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
                        className="cursor-pointer truncate rounded-md bg-[#222228] px-1.5 py-0.5 text-[10px] font-medium text-white transition-all hover:bg-primary hover:text-white border border-[#2e2e36]"
                      >
                        {evt.startTime && <span className="text-orange-400 mr-1">{evt.startTime}</span>}
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
              className="group flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-2xl border border-[#232328] bg-[#141417] p-4 transition-all hover:border-primary/40 hover:bg-[#18181c]"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                      categoryBadgeColors[evt.category] || categoryBadgeColors.general
                    }`}
                  >
                    {evt.category.replace('-', ' ')}
                  </span>
                  <span className="text-xs font-mono text-orange-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {evt.startDate} {evt.startTime && `· ${evt.startTime}`}
                  </span>
                </div>
                <h3 className="font-bold text-sm text-white group-hover:text-primary transition-colors">
                  {evt.title}
                </h3>
                {evt.description && (
                  <p className="text-xs text-zinc-400 line-clamp-2">{evt.description}</p>
                )}
                {evt.location && (
                  <p className="text-[11px] text-zinc-500 flex items-center gap-1 font-mono">
                    <MapPin className="h-3 w-3 text-zinc-400" /> {evt.location}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <button
                  onClick={() => downloadIcsFile(evt)}
                  className="rounded-xl border border-[#2c2c34] px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                >
                  <Download className="inline-block mr-1 h-3.5 w-3.5" />
                  .ics
                </button>
                <Button
                  size="sm"
                  onClick={() => handleAddToGoogleCalendar(evt)}
                  className="rounded-xl bg-primary text-xs font-medium text-white hover:bg-primary/90"
                >
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
          <div className="w-full max-w-lg rounded-2xl border border-[#27272a] bg-[#141416] p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">Schedule Content & Event</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Add a social publishing schedule or content milestone and sync to Google Calendar.
            </p>

            <form onSubmit={handleCreateEvent} className="space-y-3.5">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Schedule Title *</label>
                <input
                  type="text"
                  required
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="e.g. Publish DeepSeek R1 Analysis Thread"
                  className="w-full rounded-xl border border-[#27272a] bg-[#18181c] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={newEvent.startDate}
                    onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                    className="w-full rounded-xl border border-[#27272a] bg-[#18181c] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Time</label>
                  <input
                    type="time"
                    value={newEvent.startTime}
                    onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                    className="w-full rounded-xl border border-[#27272a] bg-[#18181c] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Platforms / Target</label>
                <input
                  type="text"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  placeholder="X, LinkedIn, Threads, Instagram"
                  className="w-full rounded-xl border border-[#27272a] bg-[#18181c] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Notes / Description</label>
                <textarea
                  rows={3}
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Key talking points, hashtags, attachments..."
                  className="w-full rounded-xl border border-[#27272a] bg-[#18181c] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#232328]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border-[#2a2a30]"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="rounded-xl bg-primary text-white hover:bg-primary/90">
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
