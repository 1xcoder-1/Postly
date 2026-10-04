// Which provider answered, and a human-readable reason when it did not.
export interface ProviderResult<T> {
  ok: boolean
  provider: string
  data: T | null
  error?: string
  // True when the failure was a quota/rate limit, so the chain should move on.
  retryable?: boolean
}

export class QuotaError extends Error {
  constructor(public provider: string) {
    super(`${provider} is out of free quota`)
  }
}

/** Thrown when a provider request exceeds its deadline. The router treats it
 *  like a transient failure and falls through to the next provider. */
export class TimeoutError extends Error {
  constructor(public provider: string, ms: number) {
    super(`${provider} timed out after ${ms}ms`)
  }
}

export const isTimeoutError = (e: unknown): e is TimeoutError => e instanceof TimeoutError

const RATE_STATUSES = new Set([429, 402, 503])

/** Classifies an HTTP failure: quota problems are retryable (fall through to
 *  the next provider); auth/bad-input problems are not. */
export function classifyHttpError(provider: string, status: number, body: string): Error {
  const lower = body.toLowerCase()
  const quotaHint =
    RATE_STATUSES.has(status) ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('too many requests') ||
    lower.includes('capacity')
  if (quotaHint) return new QuotaError(provider)
  return new Error(`${provider} failed (HTTP ${status}): ${body.slice(0, 200)}`)
}

export const isQuotaError = (e: unknown): e is QuotaError => e instanceof QuotaError
