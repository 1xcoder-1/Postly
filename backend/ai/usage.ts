import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { DATA_DIR } from '../paths'
import type { GenerationLogEntry, ModelUsage } from '../../src/shared/types'

// Persistent, per-day usage tracking for every AI model. Survives app restarts
// (unlike the old in-memory quota), so daily free-tier caps and failure
// cooldowns are respected across sessions. Stored as JSON in data/ai-usage.json.

const USAGE_PATH = resolve(DATA_DIR, 'ai-usage.json')
const LOG_LIMIT = 40
const MAX_DAILY_FAILURES = 3 // consecutive-ish quota/error hits before cooldown

type Day = string
const today = (): Day => new Date().toISOString().slice(0, 10)

interface ProviderCount {
  calls: number
  /** Consecutive failures today; reset on any success. Drives cooldown. */
  fails: number
  lastAt: string
}

interface UsageFile {
  day: Day
  providers: Record<string, ProviderCount>
  log: GenerationLogEntry[]
}

const EMPTY_PROVIDER: ProviderCount = { calls: 0, fails: 0, lastAt: '' }

let cache: UsageFile | null = null

function fresh(): UsageFile {
  return { day: today(), providers: {}, log: [] }
}

function load(): UsageFile {
  if (cache && cache.day === today()) return cache
  let data: UsageFile | null = null
  try {
    if (existsSync(USAGE_PATH)) data = JSON.parse(readFileSync(USAGE_PATH, 'utf8'))
  } catch {
    data = null
  }
  // New day (or unreadable file) → reset counters but keep nothing stale.
  cache = data && data.day === today() ? data : fresh()
  return cache!
}

function persist(): void {
  try {
    mkdirSync(dirname(USAGE_PATH), { recursive: true })
    writeFileSync(USAGE_PATH, JSON.stringify(load(), null, 2), 'utf8')
  } catch (e) {
    console.error('[ai-usage] persist failed:', (e as Error).message)
  }
}

function counts(provider: string): ProviderCount {
  return load().providers[provider] ?? { ...EMPTY_PROVIDER }
}

/** Records one provider attempt and appends to the rolling log. */
export function record(
  provider: string,
  kind: 'text' | 'image',
  outcome: GenerationLogEntry['outcome'],
  detail?: string
): void {
  const file = load()
  const c = file.providers[provider] ?? { ...EMPTY_PROVIDER }
  c.calls += 1
  if (outcome === 'quota' || outcome === 'timeout' || outcome === 'error') c.fails += 1
  c.lastAt = new Date().toISOString()
  file.providers[provider] = c

  file.log.unshift({ at: c.lastAt, kind, provider, outcome, detail })
  if (file.log.length > LOG_LIMIT) file.log.length = LOG_LIMIT

  persist()
}

export function callsToday(provider: string): number {
  return counts(provider).calls
}

/** A provider cools down after MAX_DAILY_FAILURES consecutive failed attempts. */
export function isCoolingDown(provider: string): boolean {
  return counts(provider).fails >= MAX_DAILY_FAILURES
}

/** Env override lets users tune caps without editing code. */
export function effectiveDailyCap(provider: string, defaultCap: number): number {
  const envKey = `AI_DAILY_${provider.toUpperCase().replace(/-/g, '_')}`
  const fromEnv = Number(process.env[envKey])
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : defaultCap
}

export function overCap(provider: string, defaultCap: number): boolean {
  return callsToday(provider) >= effectiveDailyCap(provider, defaultCap)
}

/** A success clears the cooldown by resetting the consecutive-failure streak. */
export function markSuccess(provider: string): void {
  const file = load()
  const c = file.providers[provider]
  if (c && c.fails !== 0) {
    c.fails = 0
    persist()
  }
}

/** Snapshot for the UI: available/cap/cooling for a declared provider list. */
export function usageSnapshot(
  providers: { name: string; label: string; kind: 'text' | 'image'; dailyCap: number; hasKey: () => boolean }[]
): ModelUsage[] {
  return providers.map((p) => {
    const cap = effectiveDailyCap(p.name, p.dailyCap)
    const calls = callsToday(p.name)
    return {
      provider: p.name,
      kind: p.kind,
      label: p.label,
      hasKey: p.hasKey(),
      callsToday: calls,
      dailyCap: cap,
      coolingDown: isCoolingDown(p.name),
      available: p.hasKey() && !overCap(p.name, p.dailyCap) && !isCoolingDown(p.name)
    }
  })
}

export function recentLog(): GenerationLogEntry[] {
  return load().log.slice(0, LOG_LIMIT)
}

/** Clears today's per-provider counters + log (Settings → reset daily usage).
 *  Useful when a provider recovers from a transient cooldown, or to re-enable a
 *  model that hit its local daily cap. Does not touch the real upstream quota. */
export function resetUsage(): void {
  cache = fresh()
  persist()
}
