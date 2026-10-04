// Response validation. Providers must return usable content before the router
// counts a call as a success; malformed or empty bodies are rejected so the
// next model in the chain gets a turn.

import { QuotaError } from './errors'

const MIN_TEXT_LEN = 8

/** Guards against empty replies, upstream error JSON leaking through, or an
 *  obviously truncated body. Throws QuotaError on empty (retryable). */
export function assertValidText(raw: unknown, provider: string): string {
  if (typeof raw !== 'string') throw new Error(`${provider} returned non-text`)
  const text = raw.trim()
  if (!text) throw new QuotaError(provider)
  if (text.length < MIN_TEXT_LEN) throw new Error(`${provider} reply too short to be useful`)

  const lower = text.toLowerCase()
  if (
    lower.startsWith('error:') ||
    lower.includes('"error"') && lower.includes('"detail"') ||
    lower.includes('rate limit exceeded') ||
    lower.includes('quota exceeded')
  ) {
    throw new QuotaError(provider)
  }
  return text
}

const DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+/
const HTTP_URL = /^https?:\/\/\S+/i

/** Accepts a data URL or an http(s) image URL; rejects anything else. */
export function assertValidImage(value: unknown, provider: string): string {
  if (typeof value !== 'string') throw new Error(`${provider} returned non-string image`)
  const url = value.trim()
  if (DATA_URL.test(url) || HTTP_URL.test(url)) return url
  throw new Error(`${provider} returned an invalid image reference`)
}
