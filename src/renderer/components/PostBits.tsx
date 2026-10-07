import type { PostStatus } from '@shared/types'
import { Badge } from '@/renderer/components/ui/badge'

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

export function Hashtags({ hashtags }: { hashtags: string[] }) {
  if (!hashtags.length) return null
  return <p className="font-mono text-xs text-primary/80">{hashtags.join(' ')}</p>
}
