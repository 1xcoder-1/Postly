// Direct Gemini text call — the app's only AI integration. Kept deliberately
// small: one provider, one job (the topic image brief), no fallback router.
// The API key comes from .env (GEMINI_API_KEY) only.

import { fetchWithTimeout, readText, TEXT_TIMEOUT_MS } from './httpTimeout'
import { classifyHttpError } from './errors'
import { buildImageBriefPrompt, parseImageBrief } from './prompts'
import type { ImageBrief } from '../../src/shared/types'

const PROVIDER = 'gemini'
const MIN_TEXT_LEN = 8

/** Guards against empty replies or obviously truncated bodies. */
function assertValidText(raw: unknown, provider: string): string {
  if (typeof raw !== 'string') throw new Error(`${provider} returned non-text`)
  const text = raw.trim()
  if (!text) throw new Error(`${provider} returned an empty reply`)
  if (text.length < MIN_TEXT_LEN) throw new Error(`${provider} reply too short to be useful`)
  return text
}

async function geminiText(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set — add it to .env to enable the image brief.')
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      provider: PROVIDER,
      timeoutMs: TEXT_TIMEOUT_MS
    }
  )
  const body = await readText(res, PROVIDER, TEXT_TIMEOUT_MS)
  if (!res.ok) throw classifyHttpError(PROVIDER, res.status, body)
  let json: any
  try {
    json = JSON.parse(body)
  } catch {
    throw new Error(`${PROVIDER} returned non-JSON body`)
  }
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('')
  if (!text) {
    const blocked = json?.promptFeedback?.blockReason
    throw new Error(blocked ? `${PROVIDER} blocked the prompt: ${blocked}` : `${PROVIDER} returned no content`)
  }
  return assertValidText(text, PROVIDER)
}

/** Asks Gemini what visual would suit the topic and for copy-ready image
 *  prompts. A malformed reply is retried once (model hiccup, not provider). */
export async function generateImageBrief(topic: string): Promise<ImageBrief> {
  const cleanTopic = String(topic ?? '').trim().slice(0, 300)
  if (!cleanTopic) throw new Error('A topic is required for the image brief')
  const first = await geminiText(buildImageBriefPrompt(cleanTopic))
  try {
    return parseImageBrief(first, cleanTopic)
  } catch {
    const retry = await geminiText(buildImageBriefPrompt(cleanTopic))
    return parseImageBrief(retry, cleanTopic)
  }
}
