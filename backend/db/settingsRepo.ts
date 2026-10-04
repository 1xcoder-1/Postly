import { eq } from 'drizzle-orm'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { getDb } from './client'
import { settings } from './schema'
import { DATA_DIR } from '../paths'

// Key/value store for NON-SECRET app preferences (default platforms, carousel
// size, etc.). API keys never go here — those are handled by safeStorage.
// Mirrors postStore's pattern: Postgres when connected, else a JSON file.

const FALLBACK_PATH = resolve(DATA_DIR, 'settings-prefs.json')

function loadFallback(): Record<string, string> {
  try {
    return existsSync(FALLBACK_PATH) ? JSON.parse(readFileSync(FALLBACK_PATH, 'utf8')) : {}
  } catch {
    return {}
  }
}
function saveFallback(map: Record<string, string>): void {
  mkdirSync(dirname(FALLBACK_PATH), { recursive: true })
  writeFileSync(FALLBACK_PATH, JSON.stringify(map, null, 2), 'utf8')
}

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb()
  if (!db) return loadFallback()[key] ?? null
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  return rows[0]?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb()
  if (!db) {
    const map = loadFallback()
    map[key] = value
    saveFallback(map)
    return
  }
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
}

export async function allSettings(): Promise<Record<string, string>> {
  const db = getDb()
  if (!db) return loadFallback()
  const rows = await db.select().from(settings)
  return Object.fromEntries(rows.map((r: { key: string; value: string | null }) => [r.key, r.value ?? '']))
}
