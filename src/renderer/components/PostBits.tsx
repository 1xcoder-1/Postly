import type { PostRecord, PostStatus } from '@shared/types'
import { Badge } from '@/renderer/components/ui/badge'
import { PLATFORMS } from '@shared/types'

const STATUS_VARIANT: Record<PostStatus, 'success' | 'warning' | 'secondary' | 'danger'> = {
  posted: 'success',
  scheduled: 'warning',
  pending: 'secondary',
  draft: 'secondary',
  rejected: 'danger',
  failed: 'danger'
}

export function StatusBadge({ status }: { status: PostStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
}

export function PlatformTags({ platforms }: { platforms: PostRecord['platforms'] }) {
  if (!platforms.length) return <span className="text-xs text-muted-foreground">no platforms</span>
  return (
    <div className="flex gap-1">
      {PLATFORMS.filter((p) => platforms.includes(p)).map((p) => (
        <Badge key={p} variant="outline" className="text-[10px]">
          {p}
        </Badge>
      ))}
    </div>
  )
}

export function Hashtags({ hashtags }: { hashtags: string[] }) {
  if (!hashtags.length) return null
  return <p className="font-mono text-xs text-primary/80">{hashtags.join(' ')}</p>
}
