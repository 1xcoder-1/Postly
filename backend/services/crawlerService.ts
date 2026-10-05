import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { CRAWLERS_DIR, DATA_DIR } from '../paths'
import type { AgentReachReport, CrawlerTopic, DailyTopicsOptions } from '../../src/shared/types'

// Node ↔ Python bridge for topic crawling.
//
// Security posture:
//   • Python is spawned with an ARGV ARRAY and never `shell: true`.
//   • Every process has a hard timeout and is SIGKILL'd if it overruns.
//   • Whatever Python prints is VALIDATED + SANITIZED into a strict shape
//     before it can reach the renderer — arbitrary objects/strings never pass.
//   • Error text (which can contain filesystem paths) stays in the main
//     process console; the renderer only ever receives clean topics or [].
//   • A missing Python interpreter is detected once and reported, not thrown.

const PYTHON = process.env.PYTHON_BIN || 'python'

/**
 * Spawn env for Python crawlers. Inherits process.env (so cookie secrets like
 * X_AUTH_TOKEN / LINKEDIN_LI_AT / REDDIT_COOKIE reach the crawlers) and adds
 * POSTLY_DATA_DIR = the writable DATA_DIR, letting Python persist account pools
 * and caches under a writable path even in a read-only packaged install.
 */
function crawlerEnv(): NodeJS.ProcessEnv {
  return { ...process.env, POSTLY_DATA_DIR: DATA_DIR, PYTHONDONTWRITEBYTECODE: '1' }
}

let pythonMissingLogged = false

const MAX_TITLE = 280
const MAX_SOURCE = 80
const MAX_URL = 500

// ── English-only filter ──────────────────────────────────────────────────────
// The user wants every suggested topic in English. Crawlers can surface
// Arabic/Urdu, Devanagari (Hindi), CJK, Cyrillic, etc. (and their own IG export
// had non-Latin captions). We drop anything not clean English, mirroring
// backend/crawlers/lang.py. Toggle off with ENGLISH_ONLY=0.
const NON_LATIN =
  /[\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u0400-\u04ff\u0370-\u03ff\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/
const ROMANIZED = new Set([
  'hai', 'hain', 'nahi', 'nhi', 'kya', 'kyu', 'kyonki', 'kyunki', 'aur', 'kro',
  'kar', 'kia', 'kiya', 'rha', 'rhi', 'rhai', 'raha', 'rahi', 'hu', 'hota',
  'hoti', 'bohat', 'bahut', 'zyada', 'thora', 'apna', 'tum', 'aap', 'hamara',
  'mera', 'teri', 'wala', 'wali', 'se', 'ko'
])

function isEnglish(text: string): boolean {
  if (!text) return false
  if (NON_LATIN.test(text)) return false
  const words = text.toLowerCase().match(/[a-z']+/g) || []
  if (!words.length) return /[A-Za-z\u00c0-\u024f]/.test(text)
  let hits = 0
  for (const w of words) if (ROMANIZED.has(w)) hits += 1
  return hits < 2
}

function englishOnlyEnabled(): boolean {
  return process.env.ENGLISH_ONLY !== '0' && process.env.ENGLISH_ONLY !== 'false'
}

// ── Tutorial/how-to filter ─────────────────────────────────────────────────
// Beginner learn-to-code spam is filtered while engineering roadmaps,
// architectural blueprints, and deep dives are preserved.
const TUTORIAL =
  /\b(crash\s+course|bootcamp|for\s+beginners?|beginners?|lec?t?ure|lesson|day\s*\d+|day\s+one|part\s*\d+|(?:ep|episode)\.?\s*\d+|in\s+one\s+video|in\s+\d+\s*(?:minutes?|hours?|days?)|portfolio\s+(?:project|website)|\d+\s+projects?|interview\s+questions|certification)\b/i
const LEARN_TECH =
  /\blearn\s+(?:to\s+)?(?:python|javascript|java|c\+\+|golang|go|rust|react|html|css|sql|node(?:\.?js)?|next(?:\.?js)?|typescript|django|flask|spring|docker|kubernetes|aws|machine\s+learning|deep\s+learning|dsa|data\s+structures)\b/i

function isTutorial(text: string): boolean {
  return TUTORIAL.test(text) || LEARN_TECH.test(text)
}

function filterTutorialsEnabled(): boolean {
  return process.env.FILTER_TUTORIALS !== '0' && process.env.FILTER_TUTORIALS !== 'false'
}

/** Coerce one unknown Python record into a safe CrawlerTopic, or null. */
function sanitizeTopic(raw: unknown): CrawlerTopic | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const title = typeof r.title === 'string' ? r.title.trim().slice(0, MAX_TITLE) : ''
  if (!title) return null

  const source = typeof r.source === 'string' ? r.source.trim().slice(0, MAX_SOURCE) : 'web'

  let url: string | null = null
  if (typeof r.url === 'string') {
    const candidate = r.url.trim().slice(0, MAX_URL)
    // Only http(s) survives — blocks javascript:, data:, file:, etc.
    if (/^https?:\/\//i.test(candidate)) url = candidate
  }

  let score: number | null = null
  if (typeof r.score === 'number' && Number.isFinite(r.score)) score = Math.max(0, Math.floor(r.score))
  else if (typeof r.score === 'string' && r.score.trim() !== '' && !Number.isNaN(Number(r.score)))
    score = Math.max(0, Math.floor(Number(r.score)))

  return { title, source, url, score }
}

function sanitizeTopics(raw: unknown): CrawlerTopic[] {
  if (!Array.isArray(raw)) return []
  const out: CrawlerTopic[] = []
  for (const item of raw) {
    const topic = sanitizeTopic(item)
    if (topic) out.push(topic)
  }
  return out
}

/** Runs a Python crawler, returns sanitized topics. [] on any failure. */
function runCrawler(script: string, args: string[] = [], timeoutMs = 20000): Promise<CrawlerTopic[]> {
  return new Promise((resolvePromise) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(PYTHON, [resolve(CRAWLERS_DIR, script), ...args], {
        // No shell. Explicit cwd; the interpreter path is never sent onward.
        cwd: CRAWLERS_DIR,
        env: crawlerEnv()
      })
    } catch {
      resolvePromise([])
      return
    }

    let out = ''
    let err = ''
    let settled = false
    const done = (value: CrawlerTopic[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(value)
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      console.error(`[crawler ${script}] timed out after ${timeoutMs}ms`)
      done([])
    }, timeoutMs)

    child.stdout?.on('data', (d) => (out += d.toString()))
    child.stderr?.on('data', (d) => (err += d.toString()))
    child.on('close', () => {
      try {
        done(sanitizeTopics(JSON.parse(out.trim() || '[]')))
      } catch {
        // err may contain paths — keep it in the main-process log only.
        console.error(`[crawler ${script}] bad output:`, (err || out).slice(0, 400))
        done([])
      }
    })
    child.on('error', (e) => {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' && !pythonMissingLogged) {
        pythonMissingLogged = true
        console.error(
          `[crawler] Python interpreter "${PYTHON}" not found. Install Python 3 or set PYTHON_BIN. Crawlers disabled.`
        )
      }
      done([])
    })
  })
}

/** Same as runCrawler but returns the raw parsed JSON (agent-reach prints an object). */
function runCrawlerRaw(script: string, args: string[] = [], timeoutMs = 20000): Promise<unknown> {
  return new Promise((resolvePromise) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(PYTHON, [resolve(CRAWLERS_DIR, script), ...args], { cwd: CRAWLERS_DIR, env: crawlerEnv() })
    } catch {
      resolvePromise(null)
      return
    }
    let out = ''
    let settled = false
    const done = (value: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(value)
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      done(null)
    }, timeoutMs)
    child.stdout?.on('data', (d) => (out += d.toString()))
    child.on('close', () => {
      try {
        done(JSON.parse(out.trim() || 'null'))
      } catch {
        done(null)
      }
    })
    child.on('error', () => done(null))
  })
}

const EMPTY_AR_REPORT: AgentReachReport = { status: {}, topics: [] }

function asAgentReachReport(raw: unknown): AgentReachReport {
  if (!raw || typeof raw !== 'object') return EMPTY_AR_REPORT
  const { status, topics } = raw as Partial<AgentReachReport>
  return {
    status: status && typeof status === 'object' ? status : {},
    topics: sanitizeTopics(topics)
  }
}

// ── Relevance + ranking ──────────────────────────────────────────────────────
// Postly boosts AI agents, developer tools, open-source alternatives,
// architecture roadmaps, and tech industry breakthroughs.
const TECH_KEYWORDS = [
  'ai', 'llm', 'gpt', 'claude', 'gemini', 'grok', 'deepseek', 'deepseek-r1', 'deepseek-v3',
  'qwen', 'model', 'agent', 'agentic', 'neural', 'machine learning', 'deep learning',
  'transformer', 'diffusion', 'rag', 'embedding', 'inference', 'fine-tun', 'quantization',
  'lora', 'qlora', 'tokenization', 'moe', 'grpo', 'dpo', 'vector db', 'qdrant', 'weaviate',
  'chroma', 'milvus', 'speculative decoding', 'flash attention', 'flashattention-3', 'kv cache',
  'pagedattention', 'sglang', 'vllm', 'tensorrt-llm', 'llama.cpp', 'unsloth', 'benchmark',
  'gpu', 'cuda', 'mlx', 'ollama', 'lm studio', 'openclaw', 'python', 'javascript', 'typescript',
  'react', 'react 19', 'react compiler', 'next.js', 'next.js 15', 'turbopack', 'vue', 'nuxt',
  'svelte', 'svelte 5', 'astro', 'solid.js', 'qwik', 'remix', 'tanstack', 'node', 'rust',
  'golang', 'bun', 'deno', 'hono', 'elysia', 'fastify', 'express', 'nest.js', 'trpc',
  'graphql', 'grpc', 'connect-rpc', 'protobuf', 'rest', 'kubernetes', 'docker', 'devops',
  'api', 'sdk', 'cli', 'open source', 'oss', 'alternative', 'self-hosted', 'framework',
  'compiler', 'database', 'postgres', 'postgresql', 'pgvector', 'mongodb', 'sql', 'drizzle',
  'prisma', 'kysely', 'supabase', 'neon', 'planetscale', 'turso', 'libsql', 'clickhouse',
  'duckdb', 'redis', 'dragonfly', 'valkey', 'keydb', 'memcached', 'kafka', 'redpanda',
  'rabbitmq', 'nats', 'temporal', 'inngest', 'trigger.dev', 'cloud', 'aws', 'azure', 'gcp',
  'cloudflare', 'workers ai', 'serverless', 'vulnerability', 'security', 'strix',
  'prompt injection', 'release', 'update', 'developer', 'startup', 'funding', 'acquisition',
  'roadmap', 'stack', 'architecture', 'system design', 'n8n', 'dify', 'activepieces',
  'langgraph', 'crewai', 'autogen', 'agno', 'openhands', 'smolagents', 'swarm', 'mcp',
  'model context protocol', 'browserbase', 'stagehand', 'pydantic-ai', 'dspy', 'instructor',
  'tools', 'skills', 'shadcn', 'tailwind', 'tailwind v4', 'radix', 'ark ui', 'base ui',
  'magic ui', 'aceternity', '21st.dev', 'daisyui', 'ui component', 'design system', 'font',
  'geist mono', 'jetbrains mono', 'fira code', 'google fonts', 'devtools', 'cursor',
  'claude code', 'windsurf', 'continue.dev', 'frontend', 'backend', 'fullstack',
  'core web vitals', 'view transitions', 'webgpu', 'three.js', 'opentelemetry',
  'cal.com', 'documenso', 'posthog', 'plausible', 'immich', 'rustdesk', 'uptime-kuma'
]



function relevance(title: string): number {
  const t = title.toLowerCase()
  let hits = 0
  for (const k of TECH_KEYWORDS) if (t.includes(k)) hits += 1
  return hits
}

/** Dedupe by normalized title, keep the higher-engagement copy. */
function dedupe(topics: CrawlerTopic[]): CrawlerTopic[] {
  const byKey = new Map<string, CrawlerTopic>()
  for (const topic of topics) {
    const key = topic.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const prev = byKey.get(key)
    if (!prev || (topic.score ?? 0) > (prev.score ?? 0)) byKey.set(key, topic)
  }
  return [...byKey.values()]
}

function filterTopics(topics: CrawlerTopic[], minEngagement: number, highEngagementOnly: boolean): CrawlerTopic[] {
  const english = englishOnlyEnabled()
  const noTutorials = filterTutorialsEnabled()
  return topics.filter((t) => {
    if (english && !isEnglish(t.title)) return false
    if (noTutorials && isTutorial(t.title)) return false
    if (highEngagementOnly && t.score == null) return false
    if (minEngagement > 0 && (t.score ?? 0) < minEngagement) return false
    return true
  })
}

/** Combined relevance + engagement score; higher sorts first. */
function rankScore(t: CrawlerTopic): number {
  const engagement = Math.log10(1 + (t.score ?? 0)) // 0..~7, dampens outliers
  return relevance(t.title) * 3 + engagement * 2
}

function rankTopics(topics: CrawlerTopic[]): CrawlerTopic[] {
  return [...topics].sort((a, b) => rankScore(b) - rankScore(a))
}

// ── Cache (30-60 min) ────────────────────────────────────────────────────────
interface CacheEntry {
  at: number
  topics: CrawlerTopic[]
}
const topicsCache = new Map<string, CacheEntry>()

function cacheTtlMs(): number {
  const minutes = Number(process.env.CRAWLER_CACHE_MINUTES)
  const clamped = Number.isFinite(minutes) && minutes > 0 ? Math.min(Math.max(minutes, 5), 120) : 45
  return clamped * 60 * 1000
}

function resolveSubreddits(extra?: string): string {
  // News/industry/AI, open source alternatives, frontend, backend, system design, and UI design subreddits
  const base = [
    'artificial', 'machinelearning', 'LocalLLaMA', 'ChatGPT', 'ClaudeAI', 'singularity',
    'selfhosted', 'opensource', 'webdev', 'Frontend', 'UI_Design', 'reactjs', 'nextjs',
    'sveltejs', 'programming', 'technology', 'systemdesign', 'devops', 'Database', 'dataengineering'
  ]
  const fromEnv = (process.env.REDDIT_SUBREDDITS || '').split(',')
  const fromOpt = (extra || '').split(',')
  const merged = [...base, ...fromEnv, ...fromOpt].map((s) => s.trim()).filter(Boolean)
  return [...new Set(merged)].join(',')
}


const envOn = (key: string): boolean => Boolean(process.env[key]?.trim())

/** Query the enabled sources in parallel; each yields sanitized topics. */
async function collectSources(subreddits: string): Promise<CrawlerTopic[]> {
  // Account-login flags: a connected personal account unlocks a deeper (slower)
  // crawl, so those sources get a longer timeout.
  const xAccount = envOn('X_AUTH_TOKEN') && envOn('X_CT0')
  const redditAccount = envOn('REDDIT_COOKIE')

  const tasks: Promise<CrawlerTopic[]>[] = [
    runCrawler('hn_crawler.py'),
    runCrawler('reddit_crawler.py', ['--subreddits', subreddits], redditAccount ? 90000 : 25000),
    runCrawler('dailydev_crawler.py'),
    // GitHub trending: AI agent skills, open-source alternatives & system design comparisons
    runCrawler('github_crawler.py', [], 45000),
    // Bluesky via the public AT Protocol API (no key, no account): always on
    runCrawler('bsky_crawler.py', [], 45000),
    runCrawlerRaw('agent_reach_crawler.py', ['--skip-doctor'], 60000).then((r) => asAgentReachReport(r).topics),
    // Reference-driven YouTube (yt-dlp): the reliable, live path. Always on.
    runCrawler('youtube_crawler.py', [], 150000),
    // LinkedIn / any tech link via Jina Reader — live engineering blogs + Voyager feed.
    runCrawler('linkedin_crawler.py', [], 60000),
    // X (Twitter) live scrape via twscrape or seeds
    runCrawler('x_crawler.py', [], xAccount ? 120000 : 45000),
    // Instagram live profile crawl
    runCrawler('instagram_crawler.py', [], 45000)
  ]

  if (envOn('CRAWL4AI_URLS') || channelActive('linkedin')) tasks.push(runCrawler('web_crawler.py', [], 90000))

  const groups = await Promise.all(tasks)
  return groups.flat()
}

/**
 * The single entry point the UI uses: combines every enabled source, then
 * dedupes, filters and ranks by relevance + engagement. Results are cached for
 * CRAWLER_CACHE_MINUTES (default 45) so repeated Dashboard refreshes don't
 * re-crawl — unless options.refresh is set, which forces a live re-crawl.
 * Never throws — a fully-failed crawl just returns [].
 */
export async function getDailyTopics(options: DailyTopicsOptions = {}): Promise<CrawlerTopic[]> {
  const subreddits = resolveSubreddits(options.subreddits)
  const minEngagement =
    options.minEngagement ?? (Number(process.env.CRAWLER_MIN_ENGAGEMENT) || 0)
  const highEngagementOnly = options.highEngagementOnly ?? false

  const key = JSON.stringify({
    subreddits,
    minEngagement,
    highEngagementOnly,
    english: englishOnlyEnabled(),
    tutorials: filterTutorialsEnabled(),
    ig: envOn('IG_PROFILES') || envOn('IG_EXPORT_FILES') || envOn('IG_USER'),
    web: envOn('CRAWL4AI_URLS'),
    // Account-login breadth changes what the crawlers can return, so it must be
    // part of the cache key (connecting/disconnecting an account busts the cache).
    xAccount: envOn('X_AUTH_TOKEN') && envOn('X_CT0'),
    linkedinAccount: envOn('LINKEDIN_LI_AT'),
    redditAccount: envOn('REDDIT_COOKIE'),
    githubAccount: envOn('GITHUB_TOKEN')
  })

  const cached = topicsCache.get(key)
  // "New topics" passes refresh:true → skip the cache and re-crawl so every
  // click surfaces genuinely fresh suggestions. Other calls reuse the cache.
  if (!options.refresh && cached && Date.now() - cached.at < cacheTtlMs()) return cached.topics

  const combined = await collectSources(subreddits)
  const ranked = rankTopics(filterTopics(dedupe(combined), minEngagement, highEngagementOnly))
  topicsCache.set(key, { at: Date.now(), topics: ranked })
  return ranked
}

/** Lets the UI warn the user instead of silently showing zero topics. */
export function pythonLooksAvailable(): boolean {
  return !pythonMissingLogged
}

// ── Agent Reach channel health (separate, slow, cached) ──────────────────────
let statusCache: { at: number; report: AgentReachReport } | null = null
const STATUS_TTL_MS = 10 * 60 * 1000

/**
 * True when the last cached `agent-reach doctor` run marked a channel as usable
 * (ok or warn). Lets the topic crawl enable channels by CAPABILITY rather than a
 * hard-coded env flag. Returns false before the first doctor report arrives.
 */
function channelActive(name: string): boolean {
  const info = statusCache?.report?.status?.[name]
  return !!info && (info.status === 'ok' || info.status === 'warn')
}

export async function fetchAgentReachStatus(refresh = false): Promise<AgentReachReport> {
  if (!refresh && statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache.report
  const raw = await runCrawlerRaw('agent_reach_crawler.py', [], 240000)
  const report = asAgentReachReport(raw)
  if (Object.keys(report.status).length) statusCache = { at: Date.now(), report }
  return report
}
