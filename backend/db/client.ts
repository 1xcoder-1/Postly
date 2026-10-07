import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { sql } from 'drizzle-orm'
import * as schema from './schema'

export const hasDatabase = (): boolean => Boolean(process.env.DATABASE_URL?.trim())

type Db = ReturnType<typeof create>
let db: Db | null | undefined

function create() {
  const client = neon(process.env.DATABASE_URL as string)
  return drizzle(client, { schema })
}

/**
 * Returns the Drizzle client, or null when DATABASE_URL is unset or the
 * connection string cannot be parsed. Never throws: a bad URL falls back to
 * the local JSON store instead of crashing app start.
 */
export function getDb(): Db | null {
  if (!hasDatabase()) return null
  if (db !== undefined) return db
  try {
    db = create()
  } catch (e) {
    console.error('[db] invalid DATABASE_URL, using local storage:', (e as Error).message)
    db = null
  }
  return db
}

export interface DbHealth {
  ok: boolean
  latencyMs: number
  error?: string
}

/** Runs `SELECT 1` to prove credentials + reachability. Used at app start. */
export async function checkDatabaseHealth(timeoutMs = 8000): Promise<DbHealth> {
  if (!hasDatabase()) return { ok: false, latencyMs: 0, error: 'DATABASE_URL not set' }
  const client = getDb()
  if (!client) return { ok: false, latencyMs: 0, error: 'DATABASE_URL could not be parsed' }

  const started = Date.now()
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`health check timed out after ${timeoutMs}ms`)), timeoutMs)
    )
    await Promise.race([client.execute(sql`select 1`), timeout])
    return { ok: true, latencyMs: Date.now() - started }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, error: (e as Error).message }
  }
}
