import { TEXT_PROVIDERS, findTextProvider, type TextProvider } from './textProviders'
import {
  record,
  markSuccess,
  isCoolingDown,
  overCap
} from './usage'
import { isQuotaError, isTimeoutError } from './errors'
import type { GenerationLogEntry } from '../../src/shared/types'

export interface ChainLogEntry {
  provider: string
  outcome: GenerationLogEntry['outcome']
  message?: string
}

export interface ChainOptions {
  /** Attempt only this provider (skips fallback). Ignored if it has no key. */
  forceProvider?: string
}

export interface TextChainResult {
  text: string
  provider: string
  log: ChainLogEntry[]
}

// A provider is usable unless it's cooling down from repeated failures or has
// hit its daily free-tier cap. The forced provider bypasses both guards.
function usable(p: TextProvider, forced?: string): boolean {
  if (forced === p.name) return true
  return !isCoolingDown(p.name) && !overCap(p.name, p.dailyCap)
}

/**
 * Walks the text providers in priority order and returns the first successful
 * generation. Every attempt is logged (used/quota/timeout/error) to the
 * persistent usage store so the UI can show which model answered and the
 * fallback chain can respect per-model caps and cooldowns.
 */
export async function generateText(prompt: string, options: ChainOptions = {}): Promise<TextChainResult> {
  const log: ChainLogEntry[] = []
  const forced = options.forceProvider
  const chain = forced
    ? [findTextProvider(forced)].filter((p): p is TextProvider => Boolean(p))
    : TEXT_PROVIDERS

  for (const provider of chain) {
    if (!provider.isAvailable()) {
      log.push({ provider: provider.name, outcome: 'skipped', message: 'no api key' })
      continue
    }
    if (!usable(provider, forced)) {
      log.push({ provider: provider.name, outcome: 'skipped', message: 'over cap or cooling' })
      continue
    }
    try {
      const text = await provider.generate(prompt)
      markSuccess(provider.name)
      record(provider.name, 'text', 'used')
      log.push({ provider: provider.name, outcome: 'used' })
      return { text, provider: provider.name, log }
    } catch (e) {
      const outcome: GenerationLogEntry['outcome'] = isQuotaError(e)
        ? 'quota'
        : isTimeoutError(e)
          ? 'timeout'
          : 'error'
      record(provider.name, 'text', outcome, (e as Error).message)
      log.push({ provider: provider.name, outcome, message: (e as Error).message })
    }
  }

  throw new Error(`All text providers exhausted. Log: ${JSON.stringify(log)}`)
}
