export interface CalendarEvent {
  id: string
  title: string
  description?: string
  location?: string
  startDate: string // YYYY-MM-DD or ISO
  startTime?: string // HH:mm
  endDate?: string // YYYY-MM-DD or ISO
  endTime?: string // HH:mm
  category: 'town-hall' | 'live-class' | 'hackathon' | 'project' | 'dsa' | 'general'
  url?: string
  allDay?: boolean
  syncedToGoogle?: boolean
}

/**
 * Format a Date object or string to Google Calendar format: YYYYMMDDTHHmmSSZ or YYYYMMDD
 */
export function formatToGoogleCalDate(dateStr: string, timeStr?: string, allDay = false): string {
  if (allDay || !timeStr) {
    // YYYYMMDD
    return dateStr.replace(/-/g, '').slice(0, 8)
  }
  const [hours, minutes] = timeStr.split(':').map((n) => n.padStart(2, '0'))
  const cleanDate = dateStr.replace(/-/g, '').slice(0, 8)
  return `${cleanDate}T${hours}${minutes}00`
}

/**
 * Generate a direct 1-click Google Calendar web link
 */
export function createGoogleCalendarUrl(event: CalendarEvent): string {
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
  const text = encodeURIComponent(event.title)
  const details = encodeURIComponent(
    `${event.description || ''}${event.url ? `\n\nLink: ${event.url}` : ''}\n\n[Created via MasterJi]`
  )
  const location = encodeURIComponent(event.location || 'Online / ChaiCode')

  let startIso = formatToGoogleCalDate(event.startDate, event.startTime, event.allDay)
  let endIso = formatToGoogleCalDate(
    event.endDate || event.startDate,
    event.endTime || (event.startTime ? calculateDefaultEndTime(event.startTime) : undefined),
    event.allDay
  )

  const dates = `${startIso}/${endIso}`

  return `${base}&text=${text}&dates=${dates}&details=${details}&location=${location}`
}

function calculateDefaultEndTime(startTime: string): string {
  const [h, m] = startTime.split(':').map(Number)
  const endH = (h + 1) % 24
  return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Generate and trigger download of an .ics file for Google Calendar / Apple Calendar / Outlook
 */
export function downloadIcsFile(event: CalendarEvent): void {
  const start = formatToGoogleCalDate(event.startDate, event.startTime, event.allDay)
  const end = formatToGoogleCalDate(
    event.endDate || event.startDate,
    event.endTime || (event.startTime ? calculateDefaultEndTime(event.startTime) : undefined),
    event.allDay
  )

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MasterJi//Cohort Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id || Date.now()}@masterji.chaicode.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${(event.description || '').replace(/\n/g, '\\n')}`,
    `LOCATION:${event.location || 'Online / ChaiCode'}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'event'}.ics`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: 'evt-1',
    title: 'Live Town Hall: Agentic AI & Spring Boot Roadmap',
    description: 'Weekly interactive cohort town hall with Hitesh Choudhary on YouTube Chai Aur Code & Discord stage.',
    location: 'YouTube — Chai Aur Code',
    startDate: '2026-10-06',
    startTime: '20:00',
    endTime: '21:30',
    category: 'town-hall',
    url: 'https://youtube.com/@chaiaurcode',
    syncedToGoogle: true
  },
  {
    id: 'evt-2',
    title: 'Hackathon Submission Deadline: Book My Ticket',
    description: 'Submit your movie ticket booking full-stack project repository and live deployment URL.',
    location: 'MasterJi Portal',
    startDate: '2026-10-11',
    startTime: '23:59',
    endTime: '23:59',
    category: 'hackathon',
    url: 'https://masterji.chaicode.com',
    syncedToGoogle: true
  },
  {
    id: 'evt-3',
    title: 'MasterJi 75: Dynamic Programming Deep Dive',
    description: 'Live problem solving session on Grid & Path DP and Advanced 2D memoization.',
    location: 'ChaiCode Live Room',
    startDate: '2026-10-14',
    startTime: '19:00',
    endTime: '20:30',
    category: 'dsa',
    syncedToGoogle: false
  },
  {
    id: 'evt-4',
    title: 'Peer Review Window: Full-Stack SaaS Projects',
    description: 'Complete 3 peer evaluations for fellow cohort members to earn full evaluation marks.',
    location: 'Peer Reviews Section',
    startDate: '2026-10-18',
    startTime: '10:00',
    endTime: '18:00',
    category: 'project',
    syncedToGoogle: false
  }
]
