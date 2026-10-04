import { Loader2 } from 'lucide-react'
import { cn } from '@/renderer/lib/utils'

interface LoadingProps {
  label?: string
  fullScreen?: boolean
  className?: string
}

/** Simple, reusable loading state. Use fullScreen for route-level waits. */
export function Loading({ label = 'Loading…', fullScreen = false, className }: LoadingProps) {
  const spinner = (
    <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  )

  if (!fullScreen) return spinner

  return <div className="flex h-full min-h-[50vh] w-full items-center justify-center">{spinner}</div>
}
