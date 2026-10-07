import type { CrawlerTopic } from '@shared/types'

// Map a raw crawler source ("youtube/freeCodeCamp", "reddit/webdev", "hackernews")
// to a friendly family label so filters and detail grouping line up.
export function familyOf(source: string): string {
  const s = source.toLowerCase()
  if (s.startsWith('youtube')) return 'YouTube'
  if (s.startsWith('github')) return 'GitHub'
  if (s.startsWith('reddit')) return 'Reddit'
  if (s.startsWith('instagram')) return 'Instagram'
  if (s.startsWith('linkedin')) return 'LinkedIn'
  if (s === 'hackernews' || s.startsWith('hn')) return 'Hacker News'
  if (s.startsWith('daily')) return 'daily.dev'
  if (s.startsWith('v2ex')) return 'V2EX'
  if (s.startsWith('bsky')) return 'Bluesky'
  if (s.startsWith('threads')) return 'Threads'
  if (s.startsWith('facebook')) return 'Facebook'
  if (s.startsWith('agent-reach') || s.startsWith('agentreach')) return 'Agent Reach'
  if (s === 'x' || s.startsWith('x/')) return 'X / Twitter'
  if (s.startsWith('web') || s.startsWith('blog')) return 'Web / Blogs'
  const head = s.split('/')[0]
  return head.charAt(0).toUpperCase() + head.slice(1)
}

// Accent colors per platform family (matches the badge tints in Topic Radar).
export const FAMILY_COLORS: Record<string, string> = {
  YouTube: 'text-red-400 bg-red-500/10',
  GitHub: 'text-emerald-400 bg-emerald-500/10',
  Reddit: 'text-orange-400 bg-orange-500/10',
  Instagram: 'text-pink-400 bg-pink-500/10',
  LinkedIn: 'text-blue-400 bg-blue-500/10',
  'Hacker News': 'text-orange-400 bg-orange-500/10',
  'X / Twitter': 'text-sky-400 bg-sky-500/10',
  Bluesky: 'text-cyan-400 bg-cyan-500/10',
  'daily.dev': 'text-violet-400 bg-violet-500/10',
  Threads: 'text-neutral-300 bg-neutral-500/10',
  Facebook: 'text-blue-500 bg-blue-500/10'
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'how', 'why', 'what',
  'who', 'when', 'where', 'just', 'are', 'was', 'will', 'its', 'our', 'you', 'can',
  'get', 'got', 'has', 'have', 'had', 'not', 'but', 'all', 'one', 'two', 'new',
  'now', 'more', 'most', 'than', 'them', 'they', 'here', 'there', 'about', 'into',
  'using', 'use', 'used', 'out', 'own', 'day', 'days', 'build', 'built', 'made'
])

/** Meaningful tokens from a topic title, for relevance matching. */
export function topicKeywords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s+#.-]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/^[.#-]+|[#.-]+$/g, ''))
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  )
}

/**
 * Topics from OTHER crawls/sources that talk about the same thing — used by the
 * detail dialog so one card click surfaces the YouTube video, Reddit thread,
 * X post, HN discussion… around the same subject. Ranked by keyword overlap.
 */
export function relatedTopics(topic: CrawlerTopic, all: CrawlerTopic[], limit = 30): CrawlerTopic[] {
  const keys = topicKeywords(topic.title)
  if (!keys.size) return []
  const scored: { t: CrawlerTopic; score: number }[] = []
  for (const t of all) {
    if (t === topic || t.title === topic.title) continue
    let hits = 0
    for (const w of topicKeywords(t.title)) {
      if (keys.has(w)) hits++
    }
    if (hits > 0) scored.push({ t, score: hits })
  }
  scored.sort((a, b) => b.score - a.score || (b.t.score ?? 0) - (a.t.score ?? 0))
  return scored.slice(0, limit).map((s) => s.t)
}

/** Group topics by platform family, largest family first. */
export function groupByFamily(topics: CrawlerTopic[]): [string, CrawlerTopic[]][] {
  const map = new Map<string, CrawlerTopic[]>()
  for (const t of topics) {
    const f = familyOf(t.source)
    const arr = map.get(f)
    if (arr) arr.push(t)
    else map.set(f, [t])
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
}
