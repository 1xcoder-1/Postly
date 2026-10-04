import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { safeStorage } from 'electron'
import { validateKeyShape } from './keyTest'
import { DATA_DIR } from '../paths'

// API keys live ONLY in the main process. The renderer never receives secret
// characters — it gets "is this key configured?" booleans. Values are persisted
// encrypted at rest via Electron safeStorage (OS keychain-backed: DPAPI on
// Windows, Keychain on macOS, libsecret on Linux). If the OS reports encryption
// is unavailable we keep the key in memory for this session only and refuse to
// write it to disk in plaintext.

const SETTINGS_PATH = resolve(DATA_DIR, 'settings.enc')

export const KEY_NAMES = [
  'DATABASE_URL',
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'HUGGINGFACE_API_KEY',
  'REDDIT_CLIENT_ID',
  'REDDIT_CLIENT_SECRET',
  'REDDIT_USER_AGENT',
  // Account-login crawling cookie secrets (encrypted at rest; flow to Python via
  // process.env). Blank = feature off, so a default install behaves unchanged.
  'X_AUTH_TOKEN',
  'X_CT0',
  'LINKEDIN_LI_AT',
  'REDDIT_COOKIE'
] as const

export type SettingKey = (typeof KEY_NAMES)[number]
export type SettingsMap = Partial<Record<SettingKey, string>>

// Keys we can still use this session even though they could not be encrypted
// to disk (fallback when safeStorage is unavailable).
let inMemoryOnly: SettingsMap = {}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/** Reads and decrypts the persisted key map. Returns {} when nothing stored. */
function loadEncrypted(): SettingsMap {
  try {
    if (!existsSync(SETTINGS_PATH) || !encryptionAvailable()) return {}
    const packed = readFileSync(SETTINGS_PATH, 'utf8')
    const json = safeStorage.decryptString(Buffer.from(packed, 'base64'))
    return JSON.parse(json) as SettingsMap
  } catch {
    return {}
  }
}

function persist(map: SettingsMap): void {
  if (!encryptionAvailable()) {
    // Security-first: never write plaintext secrets. Keep them in memory only.
    inMemoryOnly = map
    console.warn(
      '[settings] OS encryption unavailable — keys kept in memory for this session only. Use .env to persist.'
    )
    return
  }
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true })
  const enc = safeStorage.encryptString(JSON.stringify(map))
  writeFileSync(SETTINGS_PATH, enc.toString('base64'), 'utf8')
}

function currentMap(): SettingsMap {
  return { ...loadEncrypted(), ...inMemoryOnly }
}

/** Mirrors stored keys into process.env so the AI/crawler providers can read
 *  them. Does not overwrite values already coming from a real .env. */
export function initSettings(): void {
  for (const [key, value] of Object.entries(currentMap())) {
    if (value && !process.env[key]) process.env[key] = value
  }
}

/** Safe view for the renderer: presence, a non-secret length hint, and the
 *  last 4 characters only (never the full secret). This is the standard masked
 *  pattern — enough to recognize a key, not enough to use it. */
export type SettingsStatus = Record<
  SettingKey,
  { configured: boolean; length: number; last4: string }
>

export function getSettings(): SettingsStatus {
  const stored = currentMap()
  const status = {} as SettingsStatus
  for (const key of KEY_NAMES) {
    const value = stored[key] ?? process.env[key] ?? ''
    status[key] = {
      configured: Boolean(value),
      length: value.length,
      last4: value.length >= 4 ? value.slice(-4) : ''
    }
  }
  return status
}

export function setSettings(patch: SettingsMap): SettingsStatus {
  // Validate shape BEFORE saving anything (and throw without echoing the value).
  for (const key of KEY_NAMES) {
    if (!(key in patch)) continue
    const error = validateKeyShape(key, patch[key] || '')
    if (error) throw new Error(error)
  }

  const map = currentMap()
  for (const key of KEY_NAMES) {
    if (!(key in patch)) continue
    const value = (patch[key] || '').trim()
    if (value) {
      map[key] = value
      process.env[key] = value
    } else {
      delete map[key]
      delete process.env[key]
    }
  }
  persist(map)
  return getSettings()
}

/** True when the OS keychain/DPAPI can persist secrets at rest. */
export function canPersistSecrets(): boolean {
  return encryptionAvailable()
}

export { hasDatabase } from '../db/client'
