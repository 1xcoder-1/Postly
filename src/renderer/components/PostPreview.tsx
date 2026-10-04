import { useState } from 'react'
import { PLATFORMS, type Platform } from '@shared/types'
import { cn } from '@/renderer/lib/utils'
import { Badge } from '@/renderer/components/ui/badge'

// Per-platform caption budgets (approximate, unicode code points).
export const PLATFORM_LIMITS: Record<Platform, number> = {
  x: 280,
  linkedin: 3000,
  instagram: 2200,
  threads: 500,
  reddit: 4000
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  threads: 'Threads',
  reddit: 'Reddit'
}

/** Count unicode code points so emoji/CTR aren't miscounted as 1. */
export function captionLength(s: string): number {
  return [...s].length
}

/** Inline remaining/over counter, turns amber near the limit and red over. */
export function CharCounter({
  value,
  limit,
  className
}: {
  value: string
  limit: number
  className?: string
}) {
  const len = captionLength(value)
  const over = len > limit
  const near = !over && len > limit * 0.9
  return (
    <span
      className={cn(
        'font-mono text-[11px] tabular-nums',
        over ? 'text-rose-400' : near ? 'text-amber-500' : 'text-muted-foreground',
        className
      )}
    >
      {len}/{limit}
    </span>
  )
}

interface PostPreviewProps {
  title: string
  description: string
  hashtags: string[]
  imageUrl: string | null
  platform?: Platform
  onPlatformChange?: (p: Platform) => void
}

/**
 * Shows how the merged title + caption + hashtags + image will read on each
 * platform. The selected tab is driven by the parent when `platform` is given
 * (controlled), otherwise it manages its own state.
 */
export function PostPreview(props: PostPreviewProps) {
  const [internal, setInternal] = useState<Platform>('x')
  const platform = props.platform ?? internal
  const setPlatform = (p: Platform) => {
    setInternal(p)
    props.onPlatformChange?.(p)
  }

  const caption = [props.title, props.description].filter(Boolean).join('\n\n')
  const withTags = [caption, props.hashtags.map((h) => `#${h}`).join(' ')]
    .filter(Boolean)
    .join('\n\n')
  const limit = PLATFORM_LIMITS[platform]
  const len = captionLength(withTags)
  const over = len > limit
  const truncated = over ? withTags.slice(0, limit) : withTags

  return (
    <div className="rounded-xl border bg-card shadow-card">
      <div className="flex items-center gap-1 border-b p-2">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={cn(
              'rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors',
              p === platform
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {PLATFORM_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-sm font-bold text-primary">
            P
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Postly</span>
              <Badge variant="outline" className="text-[10px]">@postly</Badge>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {truncated || <span className="text-muted-foreground">Start typing to see a preview…</span>}
              {over && <span className="text-rose-400">…</span>}
            </p>
          </div>
        </div>

        {props.imageUrl && (
          <img
            src={props.imageUrl}
            alt="preview"
            className="mt-3 max-h-56 w-full rounded-lg border object-cover"
          />
        )}

        <div className="mt-3 flex items-center justify-between border-t pt-2">
          <CharCounter value={withTags} limit={limit} />
          {over && <span className="text-[11px] text-rose-400">over limit on {PLATFORM_LABEL[platform]}</span>}
        </div>
      </div>
    </div>
  )
}
