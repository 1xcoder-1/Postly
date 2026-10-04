import { randomUUID } from 'node:crypto'
import type {
  GeneratePostInput,
  GeneratedVariant,
  PostRecord,
  CarouselSlide
} from '../../src/shared/types'
import { generateText } from '../ai/textChain'
import { generateImage } from '../ai/imageChain'
import {
  buildPostPrompt,
  parseVariants,
  buildCarouselPrompt,
  parseCarousel,
  buildImagePrompt,
  buildSlideImagePrompt
} from '../ai/prompts'
import { recentRejections } from '../db/postStore'

export interface GenerateResult {
  variants: GeneratedVariant[]
  slides: CarouselSlide[] | null
  imageUrl: string | null
  textProvider: string
  imageProvider: string | null
}

/** Runs async `fn` over `items` with at most `limit` in flight, preserving
 *  order. Used to generate one image per carousel slide without hammering the
 *  provider (a 6-slide set at concurrency 3). */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

/** Generates 3 style variants (learning from rejections), optional carousel
 *  slides, and a viral image. Image failure is non-fatal. */
export async function generatePostContent(input: GeneratePostInput): Promise<GenerateResult> {
  const rejections = await recentRejections(input.topic).catch(() => [])
  const tone = input.tone ?? 'casual'
  const style = input.imageStyle ?? 'editorial-photo'

  const textRes = await generateText(buildPostPrompt(input.topic, tone, rejections), {
    forceProvider: input.forceTextModel
  })
  const variants = parseVariants(textRes.text)

  let slides: CarouselSlide[] | null = null
  if (input.carousel) {
    const slideRes = await generateText(buildCarouselPrompt(input.topic, input.slidesCount ?? 6, tone), {
      forceProvider: input.forceTextModel
    })
    slides = parseCarousel(slideRes.text)
  }

  let imageProvider: string | null = null

  if (slides) {
    // Carousel: one text-free, styled image per slide. Individual failures are
    // non-fatal (that slide keeps imageUrl: null and falls back to a text card).
    slides = await mapWithConcurrency(slides, 3, async (slide) => {
      const { prompt, negative } = buildSlideImagePrompt(input.topic, slide, style)
      try {
        const img = await generateImage(prompt, {
          forceProvider: input.forceImageModel,
          aspect: '4:5',
          negative
        })
        imageProvider = img.provider
        return { ...slide, imageUrl: img.imageUrl }
      } catch {
        return { ...slide, imageUrl: null }
      }
    })
  }

  // Hero image: first successful slide image for carousels; else a dedicated
  // single-post image. Text is never baked in (see prompts.ts).
  let imageUrl: string | null = slides?.find((s) => s.imageUrl)?.imageUrl ?? null
  if (!slides) {
    const { prompt, negative } = buildImagePrompt(input.topic, variants[0].title, style)
    try {
      const img = await generateImage(prompt, {
        forceProvider: input.forceImageModel,
        aspect: '4:5',
        negative
      })
      imageUrl = img.imageUrl
      imageProvider = img.provider
    } catch {
      // Image generation is best-effort; the post can still be published.
    }
  }

  return { variants, slides, imageUrl, textProvider: textRes.provider, imageProvider }
}

/** Turns the chosen variant into a draft PostRecord. */
export function variantToDraft(
  topic: string,
  variant: GeneratedVariant,
  imageUrl: string | null,
  slides: CarouselSlide[] | null
): PostRecord {
  const iso = new Date().toISOString()
  return {
    id: randomUUID(),
    topic,
    title: variant.title,
    description: variant.description,
    hashtags: variant.hashtags,
    style: variant.style,
    platforms: [],
    publication: {},
    status: 'draft',
    isCarousel: Boolean(slides?.length),
    slides: slides ?? [],
    imageUrl,
    scheduledAt: null,
    postedAt: null,
    rejectionReason: null,
    isDeleted: false,
    createdAt: iso,
    updatedAt: iso
  }
}
