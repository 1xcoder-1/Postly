import type { GeneratedVariant, CarouselSlide, PostStyle, Tone, ImageStyleId } from '../../src/shared/types'

const STYLES: PostStyle[] = ['educational', 'story', 'hot-take']

const STYLE_HINT: Record<PostStyle, string> = {
  educational: ' Teach one concrete takeaway. Clear, useful, skimmable.',
  story: ' Personal angle: a short journey, what surprised you, what changed.',
  'hot-take': ' Bold but defensible opinion. Provoke discussion, stay factual.'
}

// Voice applied on top of the style. Independent of the 3 content styles.
const TONE_HINT: Record<Tone, string> = {
  professional: 'Polished and credible. Precise wording, no slang, restrained.',
  casual: 'Friendly and conversational. Contractions, short sentences, plain words.',
  bold: 'Punchy and confident. Strong verbs, crisp hooks, unapologetic point of view.'
}

// The user is a creator who comments on and teaches about trending tech news —
// NOT the person living the source event. This guardrail stops impersonation
// (a "Why I left OpenAI" video must never become a fake first-person post) and
// forces an educational, value-adding angle on every topic.
const CREATOR_VOICE =
  'You are an independent tech creator who BREAKS DOWN and TEACHES about this topic for your audience: react to it, explain why it matters, give a clear point of view and one concrete takeaway. You are NOT the person in the original story — never fabricate first-hand experience (do not write "I left my job at X" / "we built Y" unless it truly happened to you). Refer to the source in the third person ("a new video", "OpenAI just announced", "this HN thread").'

/** Builds the prompt that asks the model for exactly 3 style variants as JSON. */
export function buildPostPrompt(
  topic: string,
  tone: Tone = 'casual',
  rejections: { rejectedTitle: string; rejectedDescription?: string; reason: string | null }[] = []
): string {
  const negative = rejections.length
    ? `\n\nRecent posts the user REJECTED — do NOT repeat these mistakes:\n${rejections
        .map((r) => {
          const why = r.reason ? ` [why: ${r.reason}]` : ''
          const body = r.rejectedDescription ? `\n    was: "${r.rejectedDescription.slice(0, 120)}"` : ''
          return `- "${r.rejectedTitle}"${why}${body}`
        })
        .join('\n')}\nLearn from these: different angle, better length, avoid the flagged tone.`
    : ''

  return `You write viral, high-value social media posts about AI agents, open-source alternatives, developer tools, tech roadmaps, and engineering architectures.

${CREATOR_VOICE}

TOPIC: ${topic}
TONE: ${tone}. ${TONE_HINT[tone]}
${negative}

Create EXACTLY 3 variants, one per style, and return ONLY JSON:
{
  "variants": [
    {
      "style": "educational | story | hot-take",
      "title": "hook under 80 chars",
      "description": "150-280 chars, the post body with clear takeaways or step breakdown",
      "hashtags": ["#ai", "#devtools", "#opensource"]
    }
  ]
}

Style rules:${STYLES.map((s) => `\n- ${s}:${STYLE_HINT[s]}`).join('')}

Rules:
- If the topic is a roadmap, architecture stack, or open-source alternative (e.g. n8n, Supabase, Ollama, LangGraph, Shadcn), break down the concrete steps, tech stack layers, or trade-offs clearly.
- If the topic is a tech comparison (e.g. GraphQL vs gRPC, Redis vs Dragonfly, Monolith vs Microservices, REST vs WebSockets), explain the core technical trade-offs, performance differences, and clear decision criteria on when to use each.
- Teach or commentate; add insight the reader can immediately use. Never just restate the headline.
- 3-6 relevant hashtags, lowercase, no spaces.
- No emojis unless they add meaning.
- Do not invent statistics or quotes.
- Output raw JSON only, no markdown fences.`
}

/** Robustly extract the JSON object from a model response that may include
 *  stray prose or ```json fences. */
function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in model output')
  return JSON.parse(candidate.slice(start, end + 1))
}

export function parseVariants(raw: string): GeneratedVariant[] {
  const json = extractJson(raw)
  const variants: GeneratedVariant[] = (json.variants ?? []).map((v: any) => ({
    style: v.style,
    title: String(v.title ?? '').trim(),
    description: String(v.description ?? '').trim(),
    hashtags: Array.isArray(v.hashtags) ? v.hashtags.map((h: string) => String(h).trim()) : []
  }))
  if (!variants.length) throw new Error('Model returned no variants')
  return variants
}

/** Carousel: one hook slide + supporting slides + a CTA, as JSON. */
export function buildCarouselPrompt(topic: string, slideCount: number, tone: Tone = 'casual'): string {
  return `Create an Instagram/LinkedIn carousel about: ${topic}

${CREATOR_VOICE}

Tone: ${tone}. ${TONE_HINT[tone]}

Return ONLY JSON with ${slideCount} slides:
{
  "slides": [
    { "index": 1, "title": "short punchy slide headline", "body": "1-2 sentences max" }
  ]
}

Rules:
- Slide 1 is the hook. Last slide is a call to action.
- Keep each slide under 200 characters.
- Output raw JSON only, no markdown fences.`
}

export function parseCarousel(raw: string): CarouselSlide[] {
  const json = extractJson(raw)
  const slides: CarouselSlide[] = (json.slides ?? []).map((s: any, i: number) => ({
    index: typeof s.index === 'number' ? s.index : i + 1,
    title: String(s.title ?? '').trim(),
    body: String(s.body ?? '').trim()
  }))
  if (!slides.length) throw new Error('Model returned no slides')
  return slides
}

// ── Image style system (ChatGPT-style presets) ──────────────────────────────
// Each preset deliberately steers AWAY from the oversaturated "AI slop" look:
// real textures, restrained palette, natural light — and NEVER asks the model
// to render text (image models garble text, which is the #1 AI giveaway).
interface ImageStylePreset {
  label: string
  medium: string
  palette: string
  look: string
  avoid: string
}

export const IMAGE_STYLE_PRESETS: Record<ImageStyleId, ImageStylePreset> = {
  'editorial-photo': {
    label: 'Editorial photo',
    medium: 'professional editorial photograph, shot on a 35mm prime lens',
    palette: 'natural muted colors, soft balanced daylight',
    look: 'shallow depth of field, real textures, subtle film grain, candid composition',
    avoid: 'no neon colors, no oversaturation, no HDR glow, no plastic CGI, no airbrushed skin'
  },
  cinematic: {
    label: 'Cinematic',
    medium: 'cinematic film still, anamorphic, directed photography',
    palette: 'teal-and-orange color grade, low-key moody lighting',
    look: '35mm film, natural grain, real reflections, shallow focus, depth and atmosphere',
    avoid: 'no oversaturated fantasy colors, no glossy 3D render, no lens-flare spam, no HDR halos'
  },
  documentary: {
    label: 'Documentary',
    medium: 'documentary photograph, photojournalistic, available light',
    palette: 'honest natural colors, no color grading gimmicks',
    look: 'real environment, genuine moment, slight grain, everything actually present in the scene',
    avoid: 'no studio polish, no stylized gradients, no CGI, no staged stock-photo look'
  },
  'product-natural': {
    label: 'Natural-light product',
    medium: 'product / still-life photograph on a real surface, natural window light',
    palette: 'soft neutral tones, subtle shadows on a matte surface',
    look: 'crisp real materials, gentle contact shadows, minimal cluttered styling, top-down or 45 degree',
    avoid: 'no floating holograms, no neon glow, no fake reflections, no cluttered sci-fi props'
  },
  'film-portrait': {
    label: 'Film portrait',
    medium: 'portrait photograph on medium-format film, Kodak Portra color',
    palette: 'warm analog film tones, gentle highlight roll-off',
    look: 'soft natural light, real skin texture, visible film grain, timeless framing',
    avoid: 'no airbrushed plastic skin, no beauty-filter glow, no oversaturated HDR, no CGI'
  },
  'swiss-poster': {
    label: 'Swiss poster',
    medium: 'Swiss International Typographic Style graphic, vector print',
    palette: 'two or three flat inks on off-white paper, strict grid',
    look: 'geometric abstract composition expressing the idea, generous negative space, crisp shapes',
    avoid: 'no gradients, no drop shadows, no photorealism, no busy detail, no decorative clutter'
  },
  'riso-print': {
    label: 'Risograph',
    medium: 'risograph / screen print illustration, layered spot inks',
    palette: 'limited duotone palette, slightly misregistered layers',
    look: 'grainy paper texture, simple hand-drawn symbolic scene expressing the theme, matte finish',
    avoid: 'no glossy digital gradients, no photorealism, no neon, no crisp vector perfection'
  },
  'flat-vector': {
    label: 'Flat vector',
    medium: 'modern flat vector illustration, clean minimal scene',
    palette: 'harmonious muted palette, consistent light source, soft limited shading',
    look: 'simple geometric characters/objects that symbolize the topic, balanced negative space',
    avoid: 'no neon gradients, no 3D plastic render, no clutter, no oversaturated rainbow colors'
  },
  'muted-brand': {
    label: 'Muted brand',
    medium: 'understated brand editorial graphic, mix of photo and minimal type-free layout',
    palette: 'desaturated neutral palette with one restrained accent',
    look: 'calm, premium, lots of negative space, real material or photographic texture',
    avoid: 'no loud gradients, no neon accents, no busy patterns, no stock-photo cheese'
  }
}

// Text is never baked into the image: models garble it and it instantly reads
// as "AI-generated". This clause is appended to every image prompt.
const NO_TEXT = 'Absolutely no text, no words, no letters, no numbers, no typography, no logos, no watermark, no captions, no UI elements.'

export type ImageAspect = '4:5' | '1:1'

/** Compose a style-aware, text-free image prompt for a topic concept. */
export function buildImagePromptForStyle(
  concept: string,
  style: ImageStyleId,
  aspect: ImageAspect = '4:5'
): { prompt: string; negative: string } {
  const preset = IMAGE_STYLE_PRESETS[style] ?? IMAGE_STYLE_PRESETS['editorial-photo']
  const size = aspect === '4:5' ? 'portrait 4:5' : 'square 1:1'
  const prompt =
    `${preset.medium}. A scene visually expressing: ${concept}. ` +
    `${preset.palette}. ${preset.look}. ${NO_TEXT} Composition: ${size} framing, single clear focal point. ` +
    `Real photographic authenticity, natural light, true-to-life detail.`
  return { prompt, negative: preset.avoid }
}

/** Single (non-carousel) hero image for a post topic. */
export function buildImagePrompt(topic: string, title: string, style: ImageStyleId = 'editorial-photo') {
  return buildImagePromptForStyle(`${topic}${title ? ` — concept: ${title}` : ''}`, style, '4:5')
}

/** One themed, text-free image prompt per carousel slide. */
export function buildSlideImagePrompt(topic: string, slide: CarouselSlide, style: ImageStyleId) {
  const concept = `${topic}: ${slide.title}${slide.body ? ` (${slide.body.slice(0, 90)})` : ''}`
  return buildImagePromptForStyle(concept, style, '4:5')
}
