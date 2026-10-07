import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePosts } from '@/renderer/store'

/** A scheduled post rendered as a calendar entry. Derived live from the store. */
interface CalendarEvent {
  id: string
  title: string
  description: string
  startDate: string
  startTime: string
  category: string
  location: string
}

/** Formats a Date as the local YYYY-MM-DD key used on CalendarEvent.startDate. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const DAY_HEADERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/**
 * Calendar page styled after the reference screenshot: a single dark card with
 * a slim toolbar (nav arrows, Today, month title, Day/Week/Month segmented on
 * the right) and a full month grid with the day numbers top-right and today
 * marked by an orange circle + orange cell outline.
 */
export default function CalendarPage() {
  const { posts, load } = usePosts()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [view, setView] = useState<'day' | 'week' | 'month'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    load()
  }, [load])

  // Scheduled posts from the DB are the only events (no hard-coded demo data).
  useEffect(() => {
    const postEvents: CalendarEvent[] = posts
      .filter((p) => p.scheduledAt)
      .map((p) => ({
        id: `post-${p.id}`,
        title: p.title,
        description: p.description,
        startDate: p.scheduledAt!.slice(0, 10),
        startTime: p.scheduledAt!.slice(11, 16),
        category: 'project',
        location: p.platforms.join(', ') || 'Social Platforms'
      }))
    setEvents(postEvents)
  }, [posts])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const today = new Date()

  const shift = (dir: number) => {
    if (view === 'month') setCurrentDate(new Date(year, month + dir, 1))
    else if (view === 'week') setCurrentDate(new Date(year, month, currentDate.getDate() + dir * 7))
    else setCurrentDate(new Date(year, month, currentDate.getDate() + dir))
  }
  const goToToday = () => setCurrentDate(new Date())

  const eventsOn = (key: string) => events.filter((e) => e.startDate === key)

  const EventChip = ({ evt }: { evt: CalendarEvent }) => (
    <div
      title={evt.startTime ? `${evt.startTime} · ${evt.title}` : evt.title}
      className="truncate rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary"
    >
      {evt.startTime && <span className="mr-1 opacity-80">{evt.startTime}</span>}
      {evt.title}
    </div>
  )

  // ----- Month grid cells (also used as the week row) ------------------------
  const renderDayCell = (d: Date, tall = false) => {
    const key = dayKey(d)
    const dayEvents = eventsOn(key)
    const isToday = key === dayKey(today)
    const isWeekend = d.getDay() === 0 || d.getDay() === 6
    return (
      <div
        key={key}
        className={`relative p-2 transition-colors hover:bg-white/[0.02] ${
          isToday ? 'bg-primary/[0.06] ring-1 ring-inset ring-primary' : isWeekend ? 'bg-secondary/20' : ''
        }`}
      >
        <span
          className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-xs ${
            isToday ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground'
          }`}
        >
          {d.getDate()}
        </span>
        {dayEvents.length > 0 && (
          <div className={`mt-9 space-y-1 overflow-y-auto ${tall ? 'max-h-none' : 'max-h-[80px]'}`}>
            {dayEvents.map((evt) => (
              <EventChip key={evt.id} evt={evt} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const monthGrid = () => {
    const firstDayOfMonth = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return (
      <div className="grid grid-cols-7 auto-rows-[118px] divide-x divide-y divide-border">
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => renderDayCell(new Date(year, month, i + 1)))}
      </div>
    )
  }

  const weekGrid = () => {
    const start = new Date(year, month, currentDate.getDate() - currentDate.getDay())
    return (
      <div className="grid grid-cols-7 auto-rows-[420px] divide-x divide-y divide-border">
        {Array.from({ length: 7 }).map((_, i) => renderDayCell(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), true))}
      </div>
    )
  }

  const dayList = () => {
    const key = dayKey(currentDate)
    const dayEvents = eventsOn(key)
    if (dayEvents.length === 0) {
      return <div className="py-24 text-center text-sm text-muted-foreground">No events</div>
    }
    return (
      <div className="divide-y divide-border">
        {dayEvents.map((evt) => (
          <div key={evt.id} className="flex items-baseline gap-4 px-5 py-4">
            <span className="w-14 shrink-0 text-xs font-medium text-primary">{evt.startTime || '—'}</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{evt.title}</div>
              {evt.location && <div className="mt-0.5 truncate text-xs text-muted-foreground">{evt.location}</div>}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl animate-in fade-in duration-200">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Toolbar — arrows, Today, month title left; Day/Week/Month segmented right */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => shift(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => shift(1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={goToToday}
              className="h-8 rounded-lg border border-border bg-secondary/60 px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Today
            </button>
            <span className="ml-1 text-base font-semibold tracking-tight text-foreground">
              {MONTHS[month]} {year}
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-secondary/60 p-1 text-sm">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 capitalize transition-colors ${
                  view === v ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Day-of-week header band */}
        <div className="grid grid-cols-7 border-b border-border bg-secondary/30 py-2.5 text-center text-xs font-medium tracking-wider text-muted-foreground">
          {DAY_HEADERS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Grid */}
        {view === 'month' && monthGrid()}
        {view === 'week' && weekGrid()}
        {view === 'day' && dayList()}
      </div>
    </div>
  )
}
