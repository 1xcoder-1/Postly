import { getSettings, type SettingKey } from './settingsService'
import { probeX, probeLinkedIn, probeReddit, type KeyProbeResult } from './keyTest'
import { ACCOUNT_SOURCES, type AccountSource, type AccountStatus } from '../../src/shared/types'

// Per-account connection status for the renderer (accounts:status). Reuses the
// exact identity probes from keyTest.ts. SECURITY: only NON-secret data crosses
// the IPC boundary — configured/connected flags, the resolved handle, and a human
// message. Cookie values are never read here, never logged, never returned.

interface SourceConfig {
  /** Secrets that must all be configured for this source to count as set up. */
  keys: SettingKey[]
  probe: () => Promise<KeyProbeResult>
}

const SOURCE_CONFIG: Record<AccountSource, SourceConfig> = {
  x: { keys: ['X_AUTH_TOKEN', 'X_CT0'], probe: probeX },
  linkedin: { keys: ['LINKEDIN_LI_AT'], probe: probeLinkedIn },
  reddit: { keys: ['REDDIT_COOKIE'], probe: probeReddit }
}

// Probes hit live platform endpoints, so cache briefly to avoid hammering them
// on every Dashboard/Settings mount. Invalidated whenever cookies are (re)saved.
const CACHE_TTL_MS = 60_000
let cache: { at: number; statuses: AccountStatus[] } | null = null

/** Drops the cached statuses so the next call re-probes (used after a save/login). */
export function invalidateAccountStatusCache(): void {
  cache = null
}

/**
 * Returns one AccountStatus per source. Probes run ONLY for configured sources;
 * unconfigured sources short-circuit to a cheap "Not connected" without a
 * network call. Never throws — a failed probe just yields connected:false.
 */
export async function getAccountStatuses(force = false): Promise<AccountStatus[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.statuses

  const settings = getSettings()
  const statuses = await Promise.all(
    ACCOUNT_SOURCES.map(async (source): Promise<AccountStatus> => {
      const cfg = SOURCE_CONFIG[source]
      const configured = cfg.keys.every((k) => settings[k]?.configured)
      if (!configured) return { source, configured: false, connected: false, message: 'Not connected' }
      try {
        const r = await cfg.probe()
        return { source, configured: true, connected: r.ok, handle: r.handle, message: r.message }
      } catch {
        return { source, configured: true, connected: false, message: 'Could not verify connection' }
      }
    })
  )

  cache = { at: Date.now(), statuses }
  return statuses
}
