import { QuotaError, classifyHttpError } from './errors'
import { fetchWithTimeout, readText, readBuffer, IMAGE_TIMEOUT_MS } from './httpTimeout'
import { assertValidImage } from './validation'

export interface ImageGenOptions {
  /** Requested aspect ratio. IG default is portrait 4:5. */
  aspect?: '4:5' | '1:1'
  /** Anti-slop negative cues ("no neon, no oversaturation, no text..."). */
  negative?: string
}

export interface ImageProvider {
  name: string
  label: string
  envKey: string
  dailyCap: number
  isAvailable: () => boolean
  /** Returns a data URL (data:image/png;base64,...) or a remote http URL. */
  generate: (prompt: string, options?: ImageGenOptions) => Promise<string>
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, provider: string) {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    provider,
    timeoutMs: IMAGE_TIMEOUT_MS
  })
  const text = await readText(res, provider, IMAGE_TIMEOUT_MS)
  if (!res.ok) throw classifyHttpError(provider, res.status, text)
  return JSON.parse(text)
}

// Gemini image generation (flash image preview).
const geminiImage: ImageProvider = {
  name: 'gemini-image',
  label: 'Gemini Image',
  envKey: 'GEMINI_API_KEY',
  dailyCap: 50,
  isAvailable: () => Boolean(process.env.GEMINI_API_KEY),
  async generate(prompt, options = {}) {
    const key = process.env.GEMINI_API_KEY
    const aspect = options.aspect ?? '4:5'
    // Fold the anti-slop / no-text cues into the request text; some Gemini
    // image endpoints ignore a separate negative field.
    const fullPrompt = options.negative ? `${prompt}. ${options.negative}.` : prompt
    const body = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: aspect }
      }
    }
    const json = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`,
      {},
      body,
      this.name
    )
    const part = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)
    if (!part) throw new QuotaError(this.name)
    return assertValidImage(`data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`, this.name)
  }
}

// Cloudflare Workers AI image generation (Flux).
const cloudflareImage: ImageProvider = {
  name: 'cloudflare-image',
  label: 'Cloudflare Flux',
  envKey: 'CLOUDFLARE_API_TOKEN',
  dailyCap: 50,
  isAvailable: () => Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID),
  async generate(prompt, options = {}) {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID
    const fullPrompt = options.negative ? `${prompt}. ${options.negative}.` : prompt
    // flux-1-schnell renders a fixed 512x512 and REJECTS width/height; steps
    // must be <= 8. Portrait 4:5 is honored by the Gemini / Pollinations
    // providers instead, so this is just the square fallback rung.
    const json = await postJson(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      { prompt: fullPrompt, steps: 4 },
      this.name
    )
    const b64 = json?.result?.image
    if (!b64) throw new QuotaError(this.name)
    return assertValidImage(`data:image/png;base64,${b64}`, this.name)
  }
}

// Hugging Face inference (SDXL) - returns binary, we base64 it.
const huggingFaceImage: ImageProvider = {
  name: 'huggingface',
  label: 'Hugging Face SDXL',
  envKey: 'HUGGINGFACE_API_KEY',
  dailyCap: 30,
  isAvailable: () => Boolean(process.env.HUGGINGFACE_API_KEY),
  async generate(prompt, options = {}) {
    const res = await fetchWithTimeout(
      'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}` },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            negative_prompt: options.negative ?? 'text, words, letters, watermark, low quality',
            guidance_scale: 7.5
          }
        }),
        provider: this.name,
        timeoutMs: IMAGE_TIMEOUT_MS
      }
    )
    if (!res.ok) throw classifyHttpError(this.name, res.status, await readText(res, this.name, IMAGE_TIMEOUT_MS))
    const buf = await readBuffer(res, this.name, IMAGE_TIMEOUT_MS)
    return assertValidImage(`data:image/png;base64,${Buffer.from(buf).toString('base64')}`, this.name)
  }
}

// Pollinations: free, no key. Returns a ready image URL (keyless, tight cap).
const pollinationsImage: ImageProvider = {
  name: 'pollinations-image',
  label: 'Pollinations Image (no key)',
  envKey: '',
  dailyCap: 20,
  isAvailable: () => true,
  async generate(prompt, options = {}) {
    // Flux via Pollinations is the keyless fallback. enhance=false keeps the
    // model from re-adding the "AI gloss"; nologo removes the watermark.
    const dims = (options.aspect ?? '4:5') === '1:1' ? { width: 1024, height: 1024 } : { width: 1080, height: 1350 }
    const fullPrompt = options.negative ? `${prompt}. ${options.negative}.` : prompt
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?model=flux&width=${dims.width}&height=${dims.height}&nologo=true&enhance=false&seed=${Math.floor(Math.random() * 1e6)}`
    const res = await fetchWithTimeout(url, { provider: this.name, timeoutMs: IMAGE_TIMEOUT_MS })
    if (!res.ok) throw classifyHttpError(this.name, res.status, await readText(res, this.name, IMAGE_TIMEOUT_MS))
    return assertValidImage(url, this.name)
  }
}

// To add an image model: insert a new ImageProvider here in priority order.
export const IMAGE_PROVIDERS: ImageProvider[] = [
  geminiImage,
  cloudflareImage,
  huggingFaceImage,
  pollinationsImage
]

export function findImageProvider(name: string): ImageProvider | undefined {
  return IMAGE_PROVIDERS.find((p) => p.name === name)
}
