import { IMAGE_PROVIDERS, findImageProvider, type ImageProvider, type ImageGenOptions } from './imageProviders'
import { record, markSuccess, isCoolingDown, overCap } from './usage'
import { isQuotaError, isTimeoutError } from './errors'
import type { GenerationLogEntry } from '../../src/shared/types'
import type { ChainLogEntry, ChainOptions } from './textChain'

export interface ImageChainResult {
  imageUrl: string
  provider: string
  log: ChainLogEntry[]
}

function usable(p: ImageProvider, forced?: string): boolean {
  if (forced === p.name) return true
  return !isCoolingDown(p.name) && !overCap(p.name, p.dailyCap)
}

/** Same fallback/logging strategy as the text chain, for image generation. */
export async function generateImage(
  prompt: string,
  options: ChainOptions & ImageGenOptions = {}
): Promise<ImageChainResult> {
  const log: ChainLogEntry[] = []
  const forced = options.forceProvider
  const chain = forced
    ? [findImageProvider(forced)].filter((p): p is ImageProvider => Boolean(p))
    : IMAGE_PROVIDERS

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
      const imageUrl = await provider.generate(prompt, { aspect: options.aspect, negative: options.negative })
      markSuccess(provider.name)
      record(provider.name, 'image', 'used')
      log.push({ provider: provider.name, outcome: 'used' })
      return { imageUrl, provider: provider.name, log }
    } catch (e) {
      const outcome: GenerationLogEntry['outcome'] = isQuotaError(e)
        ? 'quota'
        : isTimeoutError(e)
          ? 'timeout'
          : 'error'
      record(provider.name, 'image', outcome, (e as Error).message)
      log.push({ provider: provider.name, outcome, message: (e as Error).message })
    }
  }

  throw new Error(`All image providers exhausted. Log: ${JSON.stringify(log)}`)
}
