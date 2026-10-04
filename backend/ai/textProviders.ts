import { QuotaError, classifyHttpError } from './errors'
import { fetchWithTimeout, readText, TEXT_TIMEOUT_MS } from './httpTimeout'
import { assertValidText } from './validation'

export interface TextProvider {
  name: string
  /** Human label for the AI-status UI. */
  label: string
  /** Env var this provider needs; unset means "skip me". */
  envKey: string
  /** Conservative free-tier daily call budget; overridable via AI_DAILY_<NAME>. */
  dailyCap: number
  isAvailable: () => boolean
  generate: (prompt: string) => Promise<string>
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  provider: string
): Promise<any> {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    provider,
    timeoutMs: TEXT_TIMEOUT_MS
  })
  const text = await readText(res, provider, TEXT_TIMEOUT_MS)
  if (!res.ok) throw classifyHttpError(provider, res.status, text)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${provider} returned non-JSON body`)
  }
}

// Groq: llama-3.3-70b-versatile, generous free tier.
const groq: TextProvider = {
  name: 'groq',
  label: 'Groq · Llama 3.3 70B',
  envKey: 'GROQ_API_KEY',
  dailyCap: 200,
  isAvailable: () => Boolean(process.env.GROQ_API_KEY),
  async generate(prompt) {
    const json = await postJson(
      'https://api.groq.com/openai/v1/chat/completions',
      { authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      { model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.8 },
      this.name
    )
    return assertValidText(json?.choices?.[0]?.message?.content, this.name)
  }
}

// Gemini: free-tier generateContent.
const gemini: TextProvider = {
  name: 'gemini',
  label: 'Google Gemini 2.5 Flash',
  envKey: 'GEMINI_API_KEY',
  dailyCap: 100,
  isAvailable: () => Boolean(process.env.GEMINI_API_KEY),
  async generate(prompt) {
    const key = process.env.GEMINI_API_KEY
    const json = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {},
      { contents: [{ parts: [{ text: prompt }] }] },
      this.name
    )
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('')
    if (!text) {
      const blocked = json?.promptFeedback?.blockReason
      throw new Error(blocked ? `gemini blocked prompt: ${blocked}` : new QuotaError(this.name).message)
    }
    return assertValidText(text, this.name)
  }
}

// OpenRouter: free-models-only route.
const openRouter: TextProvider = {
  name: 'openrouter',
  label: 'OpenRouter (free models)',
  envKey: 'OPENROUTER_API_KEY',
  dailyCap: 50,
  isAvailable: () => Boolean(process.env.OPENROUTER_API_KEY),
  async generate(prompt) {
    const json = await postJson(
      'https://openrouter.ai/api/v1/chat/completions',
      { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      {
        model: 'meta-llama/llama-3.2-3b-instruct:free',
        messages: [{ role: 'user', content: prompt }],
        models: ['meta-llama/llama-3.2-3b-instruct:free', 'google/gemini-flash-185']
      },
      this.name
    )
    return assertValidText(json?.choices?.[0]?.message?.content, this.name)
  }
}

// Cloudflare Workers AI: text-generation endpoint.
const cloudflare: TextProvider = {
  name: 'cloudflare',
  label: 'Cloudflare Workers AI',
  envKey: 'CLOUDFLARE_API_TOKEN',
  dailyCap: 100,
  isAvailable: () => Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID),
  async generate(prompt) {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID
    const json = await postJson(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      { messages: [{ role: 'user', content: prompt }] },
      this.name
    )
    const content = json?.result?.response ?? json?.result?.messages?.[0]?.content
    return assertValidText(content, this.name)
  }
}

// Free, no key: Pollinations text endpoint (keyless last resort, tight cap).
const pollinationsText: TextProvider = {
  name: 'pollinations',
  label: 'Pollinations (no key)',
  envKey: '',
  dailyCap: 20,
  isAvailable: () => true,
  async generate(prompt) {
    const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`
    const res = await fetchWithTimeout(url, { provider: this.name, timeoutMs: TEXT_TIMEOUT_MS })
    const text = await readText(res, this.name, TEXT_TIMEOUT_MS)
    if (!res.ok) throw classifyHttpError(this.name, res.status, text)
    return assertValidText(text, this.name)
  }
}

// Priority order from the spec, with Pollinations as a keyless last resort.
// To add a model: drop a new TextProvider into this array in the right slot.
export const TEXT_PROVIDERS: TextProvider[] = [groq, gemini, openRouter, cloudflare, pollinationsText]

export function findTextProvider(name: string): TextProvider | undefined {
  return TEXT_PROVIDERS.find((p) => p.name === name)
}
