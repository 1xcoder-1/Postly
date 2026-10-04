import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { Platform, PostRecord } from '@shared/types'
import { usePosts } from '@/renderer/store'
import { api, buildComposeUrl } from '@/renderer/lib/api'
import { Badge } from '@/renderer/components/ui/badge'
import { Button } from '@/renderer/components/ui/button'
import {
  PLATFORM_LIMITS,
  PLATFORM_LABEL,
  captionLength,
  CharCounter
} from '@/renderer/components/PostPreview'
import { cn } from '@/renderer/lib/utils'

// Merged caption the user actually pastes: title + body + hashtag line.
function buildCaption(post: PostRecord): string {
  const body = [post.title, post.description].filter(Boolean).join('\n\n')
  return [body, post.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n')
}

// Manual, OAuth-free posting flow: copy the caption and open the platform's
// official page. We never auto-publish or store any platform credentials.
export function ReadyToPost({ post }: { post: PostRecord }) {
  const setPlatformPosted = usePosts((s) => s.setPlatformPosted)
  const [busy, setBusy] = useState<Platform | null>(null)
  const caption = buildCaption(post)

  async function copy(platform: Platform) {
    try {
      await navigator.clipboard.writeText(caption)
      const over = captionLength(caption) > PLATFORM_LIMITS[platform]
      toast.success(`Caption copied${over ? ` — over ${PLATFORM_LABEL[platform]}'s limit` : ''}`)
    } catch {
      toast.error('Clipboard unavailable')
    }
  }

  async function open(platform: Platform) {
    setBusy(platform)
    try {
      await api.openExternal(buildComposeUrl(platform, caption))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function markPosted(platform: Platform) {
    try {
      await setPlatformPosted(post.id, platform)
      toast.success(`Marked posted on ${PLATFORM_LABEL[platform]}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (post.platforms.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
        No platforms selected. Edit the post to choose where it will go.
      </p>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Copy the caption, open the platform, paste it there, then mark it posted.
      </p>
      {post.platforms.map((platform) => {
        const pub = post.publication[platform]
        const isPosted = pub?.status === 'posted'
        const limit = PLATFORM_LIMITS[platform]
        const over = captionLength(caption) > limit
        return (
          <div
            key={platform}
            className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2"
          >
            <span className="text-sm font-medium">{PLATFORM_LABEL[platform]}</span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px]',
                isPosted ? 'border-emerald-500/50 text-emerald-500' : 'text-amber-500'
              )}
            >
              {isPosted ? 'Posted' : 'Ready'}
            </Badge>
            <CharCounter value={caption} limit={limit} className={over ? 'text-rose-400' : undefined} />
            {over && <span className="text-[11px] text-rose-400">over limit</span>}

            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(platform)}>
                <Copy /> Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => open(platform)}
                disabled={busy === platform}
              >
                <ExternalLink /> Open
              </Button>
              <Button
                size="sm"
                variant={isPosted ? 'ghost' : 'secondary'}
                onClick={() => markPosted(platform)}
                disabled={isPosted}
              >
                <Check /> {isPosted ? 'Done' : 'Mark posted'}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
