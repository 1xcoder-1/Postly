// ── Local session scope (main process) ─────────────────────────────────────
// The app is single-user and offline-first: every DB read/write is scoped to a
// stable per-device id persisted next to the other local state, so rows stay
// attached to the same "user" across launches. There is no cloud login.
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { DATA_DIR } from '../paths'

function deviceId(): string {
  const file = resolve(DATA_DIR, 'device-id.txt')
  try {
    if (existsSync(file)) {
      const saved = readFileSync(file, 'utf8').trim()
      if (saved) return saved
    }
  } catch {
    /* unreadable file → mint a fresh id below */
  }
  const id = `device_${randomUUID()}`
  try {
    writeFileSync(file, id, 'utf8')
  } catch {
    /* non-fatal: the id just won't survive restarts */
  }
  return id
}

let cachedId: string | null = null

/** The id every DB read/write is scoped to. */
export function requireUserId(): string {
  if (!cachedId) cachedId = deviceId()
  return cachedId
}
