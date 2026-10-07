import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { safeStorage } from 'electron'
import { DATA_DIR } from '../paths'

// Read-only view of the encrypted key store. Keys are managed in .env now;
// this module still decrypts settings.enc (written by older builds) and
// mirrors anything found into process.env so previously stored crawler
// credentials keep working after an upgrade.

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
  // Legacy account-login cookie secrets (no UI anymore; still mirrored so a
  // previously configured crawler keeps its credentials).
  'X_AUTH_TOKEN',
  'X_CT0',
  'LINKEDIN_LI_AT',
  'REDDIT_COOKIE',
  'GITHUB_TOKEN'
] as const

export type SettingKey = (typeof KEY_NAMES)[number]
export type SettingsMap = Partial<Record<SettingKey, string>>

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

/** Mirrors stored keys into process.env so the AI/crawler providers can read
 *  them. Does not overwrite values already coming from a real .env. */
export function initSettings(): void {
  for (const [key, value] of Object.entries(loadEncrypted())) {
    if (value && !process.env[key]) process.env[key] = value
  }
}

export { hasDatabase } from '../db/client'
