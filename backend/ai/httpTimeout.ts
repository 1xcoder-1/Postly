// Shared fetch with a hard deadline. Every provider request goes through this
// so one slow/hanging upstream cannot block the whole generation. Free tiers
// occasionally stall, and image models are slow, so text and image use
// different default timeouts.

import { TimeoutError } from './errors'

export const TEXT_TIMEOUT_MS = Number(process.env.AI_TEXT_TIMEOUT_MS ?? 30_000)
export const IMAGE_TIMEOUT_MS = Number(process.env.AI_IMAGE_TIMEOUT_MS ?? 60_000)

export interface FetchOpts {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  provider: string
}

export async function fetchWithTimeout(url: string, opts: FetchOpts): Promise<Response> {
  const { provider, timeoutMs = TEXT_TIMEOUT_MS, ...init } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new TimeoutError(provider, timeoutMs)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** Reads a response body as text, guarded so a stalled stream also times out. */
export async function readText(res: Response, provider: string, timeoutMs: number): Promise<string> {
  let timer!: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(provider, timeoutMs)), timeoutMs)
  })
  try {
    return await Promise.race([res.text(), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Same guard for a binary body (Hugging Face image bytes). */
export async function readBuffer(res: Response, provider: string, timeoutMs: number): Promise<ArrayBuffer> {
  let timer!: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(provider, timeoutMs)), timeoutMs)
  })
  try {
    return await Promise.race([res.arrayBuffer(), timeout])
  } finally {
    clearTimeout(timer)
  }
}
