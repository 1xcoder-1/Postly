import { fetchWithTimeout, readText, TEXT_TIMEOUT_MS } from '../ai/httpTimeout'
import { checkDatabaseHealth } from '../db/client'

// Lightweight key verification. The Settings "Test" button calls these to tell
// the user "Working" / "Invalid" WITHOUT making a billable generation call. We
// hit each provider's cheap auth/whoami endpoint (or SELECT 1 for the DB).
// SECURITY: the secret value is only ever placed into an auth header/URL for the
// probe and is never returned to the renderer or written to a log.

export type SecretKey =
  | 'DATABASE_URL'
  | 'GROQ_API_KEY'
  | 'GEMINI_API_KEY'
  | 'OPENROUTER_API_KEY'
  | 'CLOUDFLARE_ACCOUNT_ID'
  | 'CLOUDFLARE_API_TOKEN'
  | 'HUGGINGFACE_API_KEY'
  | 'REDDIT_CLIENT_ID'
  | 'REDDIT_CLIENT_SECRET'
  | 'REDDIT_USER_AGENT'
  | 'X_AUTH_TOKEN'
  | 'X_CT0'
  | 'LINKEDIN_LI_AT'
  | 'REDDIT_COOKIE'

// Account-login cookie secrets. Each maps to the browser cookie name we extract
// when the user pastes a full cookie jar instead of the bare value.
const COOKIE_FIELDS: Partial<Record<SecretKey, string>> = {
  X_AUTH_TOKEN: 'auth_token',
  X_CT0: 'ct0',
  LINKEDIN_LI_AT: 'li_at',
  REDDIT_COOKIE: 'token_v2'
}
const COOKIE_KEYS = new Set<string>(Object.keys(COOKIE_FIELDS))

// Browser-like UA so the identity probes look like an authenticated web client.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
// Public web-app bearer constant (not a secret) required by verify_credentials.
const X_PUBLIC_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

/** Pulls `name=value` out of a pasted cookie jar. Returns null when absent. */
function extractCookie(jar: string, name: string): string | null {
  for (const part of jar.split(/[;\r\n]/)) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) {
      const value = part.slice(idx + 1).trim()
      if (value) return value
    }
  }
  return null
}

/**
 * Normalizes a stored cookie secret to its bare value. Trims whitespace; when
 * the value looks like a cookie jar (contains '=' or ';') it extracts the named
 * cookie (auth_token / ct0 / li_at / token_v2). Falls back to the trimmed raw
 * value when no named cookie is found — e.g. a bare li_at token whose base64
 * padding legitimately contains '='.
 */
export function normalizeCookie(key: string, raw: string): string {
  const value = (raw ?? '').trim()
  if (!value) return ''
  const field = COOKIE_FIELDS[key as SecretKey]
  if (field && (value.includes('=') || value.includes(';'))) {
    const extracted = extractCookie(value, field)
    if (extracted) return extracted
  }
  return value
}

// Stable prefixes we can sanity-check on save. Providers without a fixed prefix
// (Gemini, Cloudflare, Reddit, DATABASE_URL) are skipped here.
const PREFIX_RULES: Partial<Record<SecretKey, string>> = {
  GROQ_API_KEY: 'gsk_',
  HUGGINGFACE_API_KEY: 'hf_',
  OPENROUTER_API_KEY: 'sk-or-'
}

/**
 * Returns an error string if the value clearly cannot be a valid key (wrong
 * prefix, embedded whitespace, or absurdly short). Returns null when the value
 * is acceptable or not format-checkable. Never includes the value itself.
 */
export function validateKeyShape(key: string, raw: string): string | null {
  let value = (raw ?? '').trim()
  if (!value) return null // empty means "delete" — handled by the caller
  // Account cookie keys tolerate a pasted cookie jar: normalize (extract the
  // named cookie, stripping newlines/whitespace) BEFORE the whitespace check so
  // jars pass, while ';' and '=' inside a bare token are still allowed.
  if (COOKIE_KEYS.has(key)) {
    value = normalizeCookie(key, value)
    if (!value) return `${key} could not be read — paste the cookie value or a jar containing ${COOKIE_FIELDS[key as SecretKey]}`
  }
  if (/\s/.test(value)) return `${key} contains spaces — paste the key without spaces`
  const prefix = PREFIX_RULES[key as SecretKey]
  if (prefix && !value.startsWith(prefix)) return `${key} should start with “${prefix}”`
  if (prefix && value.length < prefix.length + 8) return `${key} looks too short to be valid`
  if (key === 'CLOUDFLARE_ACCOUNT_ID' && !/^[a-z0-9]{20,40}$/i.test(value))
    return 'CLOUDFLARE_ACCOUNT_ID does not look like a Cloudflare account id'
  return null
}

async function probe(
  url: string,
  headers: Record<string, string>,
  method = 'GET',
  body?: string
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetchWithTimeout(url, { method, headers, body, provider: 'keytest', timeoutMs: TEXT_TIMEOUT_MS })
  const text = await readText(res, 'keytest', TEXT_TIMEOUT_MS)
  return { ok: res.ok, status: res.status, text }
}

export interface KeyProbeResult {
  ok: boolean
  message: string
  /** Resolved identity from account probes (screen name / public name). Never a secret. */
  handle?: string
}

/** Runs the cheapest possible auth check for a single stored key. */
export async function testApiKey(key: SecretKey): Promise<KeyProbeResult> {
  const v = (process.env[key] ?? '').trim()
  if (!v) return { ok: false, message: 'Not set' }

  try {
    switch (key) {
      case 'GROQ_API_KEY': {
        const r = await probe('https://api.groq.com/openai/v1/models', {
          authorization: `Bearer ${v}`
        })
        return r.ok
          ? { ok: true, message: 'Working' }
          : { ok: false, message: r.status === 401 ? 'Invalid key' : `Groq error ${r.status}` }
      }
      case 'GEMINI_API_KEY': {
        const r = await probe(
          `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${v}`,
          {}
        )
        return r.ok
          ? { ok: true, message: 'Working' }
          : { ok: false, message: r.status === 403 || r.status === 400 ? 'Invalid key' : `Gemini error ${r.status}` }
      }
      case 'OPENROUTER_API_KEY': {
        const r = await probe('https://openrouter.ai/api/v1/key', { authorization: `Bearer ${v}` })
        return r.ok
          ? { ok: true, message: 'Working' }
          : { ok: false, message: r.status === 401 ? 'Invalid key' : `OpenRouter error ${r.status}` }
      }
      case 'CLOUDFLARE_API_TOKEN': {
        const r = await probe('https://api.cloudflare.com/client/v4/user/tokens/verify', {
          authorization: `Bearer ${v}`
        })
        const json = safeJson(r.text)
        const status = json?.result?.status
        if (r.ok && status === 'Active') return { ok: true, message: 'Working' }
        return { ok: false, message: r.status === 401 ? 'Invalid token' : json?.errors?.[0]?.message || `Cloudflare error ${r.status}` }
      }
      case 'CLOUDFLARE_ACCOUNT_ID': {
        const token = (process.env.CLOUDFLARE_API_TOKEN ?? '').trim()
        if (!token) return { ok: false, message: 'Set the API token to verify' }
        const r = await probe(`https://api.cloudflare.com/client/v4/accounts/${v}`, {
          authorization: `Bearer ${token}`
        })
        return r.ok
          ? { ok: true, message: 'Working' }
          : { ok: false, message: r.status === 403 ? 'Token lacks access to this account' : `Cloudflare error ${r.status}` }
      }
      case 'HUGGINGFACE_API_KEY': {
        const r = await probe('https://huggingface.co/api/whoami-v2', { authorization: `Bearer ${v}` })
        return r.ok
          ? { ok: true, message: 'Working' }
          : { ok: false, message: r.status === 401 ? 'Invalid key' : `Hugging Face error ${r.status}` }
      }
      case 'REDDIT_CLIENT_ID':
      case 'REDDIT_CLIENT_SECRET': {
        const id = (process.env.REDDIT_CLIENT_ID ?? '').trim()
        const secret = (process.env.REDDIT_CLIENT_SECRET ?? '').trim()
        if (!id || !secret) return { ok: false, message: 'Needs both client id and secret' }
        const basic = Buffer.from(`${id}:${secret}`).toString('base64')
        const r = await probe(
          'https://www.reddit.com/api/v1/access_token',
          {
            authorization: `Basic ${basic}`,
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': process.env.REDDIT_USER_AGENT || 'postly:0.1 (desktop)'
          },
          'POST',
          'grant_type=client_credentials'
        )
        const json = safeJson(r.text)
        return json?.access_token
          ? { ok: true, message: 'Working' }
          : { ok: false, message: r.status === 401 ? 'Invalid credentials' : `Reddit error ${r.status}` }
      }
      case 'REDDIT_USER_AGENT': {
        return { ok: true, message: 'Free text — used with the Reddit credentials' }
      }
      case 'X_AUTH_TOKEN':
      case 'X_CT0':
        return await probeX()
      case 'LINKEDIN_LI_AT':
        return await probeLinkedIn()
      case 'REDDIT_COOKIE':
        return await probeReddit()
      case 'DATABASE_URL': {
        const health = await checkDatabaseHealth()
        return health.ok
          ? { ok: true, message: `Working (${health.latencyMs}ms)` }
          : { ok: false, message: health.error || 'Connection failed' }
      }
      // eslint-disable-next-line no-fallthrough
      default:
        return { ok: false, message: 'No test available' }
    }
  } catch (e) {
    // Network/DNS/timeout — surface the reason but never the key.
    return { ok: false, message: (e as Error).message || 'Network error' }
  }
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// ── Account-login identity probes ────────────────────────────────────────────
// Exported so accounts:status (backend/services/accountStatus.ts) can reuse the
// exact same checks. Each reads its cookie secret(s) from process.env,
// normalizes a pasted jar, verifies identity against the platform's own "who am
// I" endpoint, and returns ONLY the resolved handle in the message — never the
// secret value. Network/HTTP failures never throw; they resolve to ok:false with
// an "expired or invalid" style message.

/** X (Twitter): verify_credentials with the public web bearer + auth_token/ct0. */
export async function probeX(): Promise<KeyProbeResult> {
  const authToken = normalizeCookie('X_AUTH_TOKEN', process.env.X_AUTH_TOKEN ?? '')
  const ct0 = normalizeCookie('X_CT0', process.env.X_CT0 ?? '')
  if (!authToken || !ct0) return { ok: false, message: 'X needs both auth_token and ct0 cookies' }
  try {
    const r = await probe('https://api.x.com/1.1/account/verify_credentials.json', {
      authorization: `Bearer ${X_PUBLIC_BEARER}`,
      'x-csrf-token': ct0,
      cookie: `auth_token=${authToken}; ct0=${ct0}`,
      'user-agent': BROWSER_UA
    })
    if (!r.ok)
      return {
        ok: false,
        message:
          r.status === 401 || r.status === 403
            ? 'X session expired or invalid — reconnect your account'
            : `X error ${r.status}`
      }
    const json = safeJson(r.text)
    const screen = typeof json?.screen_name === 'string' ? json.screen_name : ''
    return screen
      ? { ok: true, message: `Connected as @${screen}`, handle: screen }
      : { ok: true, message: 'Connected' }
  } catch {
    return { ok: false, message: 'X session expired or invalid — could not verify' }
  }
}

/** LinkedIn: voyager /me with li_at + an ajax JSESSIONID/csrf pair. */
export async function probeLinkedIn(): Promise<KeyProbeResult> {
  const liAt = normalizeCookie('LINKEDIN_LI_AT', process.env.LINKEDIN_LI_AT ?? '')
  if (!liAt) return { ok: false, message: 'LinkedIn needs the li_at cookie' }
  const csrf = Math.random().toString(36).slice(2) + Date.now().toString(36)
  try {
    const r = await probe('https://www.linkedin.com/voyager/api/me', {
      cookie: `li_at=${liAt}; JSESSIONID="ajax:${csrf}"`,
      'csrf-token': csrf,
      'user-agent': BROWSER_UA
    })
    if (!r.ok)
      return {
        ok: false,
        message:
          r.status === 401 || r.status === 403
            ? 'LinkedIn session expired or invalid — reconnect your account'
            : `LinkedIn error ${r.status}`
      }
    const json = safeJson(r.text)
    const fullName = [json?.firstName, json?.lastName].filter((p) => typeof p === 'string').join(' ').trim()
    const handle = fullName || (typeof json?.publicIdentifier === 'string' ? json.publicIdentifier : '')
    return handle
      ? { ok: true, message: `Connected as ${handle}`, handle }
      : { ok: true, message: 'Connected' }
  } catch {
    return { ok: false, message: 'LinkedIn session expired or invalid — could not verify' }
  }
}

/** Reddit: /api/v1/me with the token_v2 cookie (or reddit_session fallback). */
export async function probeReddit(): Promise<KeyProbeResult> {
  const cookie = normalizeCookie('REDDIT_COOKIE', process.env.REDDIT_COOKIE ?? '')
  if (!cookie) return { ok: false, message: 'Reddit needs the token_v2 cookie' }
  try {
    const r = await probe('https://www.reddit.com/api/v1/me', {
      cookie: `token_v2=${cookie}`,
      'user-agent': process.env.REDDIT_USER_AGENT || 'Postly/0.1'
    })
    if (!r.ok)
      return {
        ok: false,
        message:
          r.status === 401 || r.status === 403
            ? 'Reddit session expired or invalid — reconnect your account'
            : `Reddit error ${r.status}`
      }
    const json = safeJson(r.text)
    const name = typeof json?.name === 'string' ? json.name : ''
    return name
      ? { ok: true, message: `Connected as u/${name}`, handle: name }
      : { ok: true, message: 'Connected' }
  } catch {
    return { ok: false, message: 'Reddit session expired or invalid — could not verify' }
  }
}
