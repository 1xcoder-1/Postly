import { markDueScheduledReady } from '../db/postStore'

// A deliberately simple, local scheduler. Scout has no server, so this runs in
// the Electron main process: every few minutes it promotes scheduled posts whose
// time has arrived to 'pending' ("ready to publish"). It never publishes anything
// by itself — publishing is a manual, human-approved step (see Drafts).

let timer: ReturnType<typeof setInterval> | null = null
let running = false

function intervalMs(): number {
  const minutes = Number(process.env.SCHEDULER_INTERVAL_MINUTES ?? 5)
  return Math.max(1, Number.isFinite(minutes) ? minutes : 5) * 60_000
}

/** Runs one scheduler pass. Returns how many posts were marked ready. */
export async function runSchedulerOnce(): Promise<number> {
  if (running) return 0 // don't overlap a slow pass
  running = true
  try {
    return await markDueScheduledReady()
  } finally {
    running = false
  }
}

/**
 * Starts the repeating scheduler. Fires once shortly after boot (so posts that
 * came due while the app was closed are caught up), then on the interval.
 * `onMoved` lets the host broadcast a refresh to open windows.
 */
export function startScheduler(onMoved?: (count: number) => void): void {
  if (timer) return
  const tick = async () => {
    try {
      const count = await runSchedulerOnce()
      if (count > 0) {
        console.log('[scheduler] marked scheduled posts ready', { count })
        onMoved?.(count)
      }
    } catch (e) {
      // Without this, a failing pass surfaced only as a generic unhandled
      // rejection with no indication that due posts are stuck in 'scheduled'.
      console.error('[scheduler] pass failed', e)
    }
  }
  setTimeout(tick, 3_000)
  timer = setInterval(tick, intervalMs())
  // Don't keep the process alive purely for the scheduler.
  timer.unref?.()
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
