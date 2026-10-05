import { cn } from '@/renderer/lib/utils'

/** Pulse placeholder block. Compose these to mirror a loading layout. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-muted/60', className)}
      aria-hidden="true"
    />
  )
}

/** Card-shaped skeleton used while AI variants are being generated. */
export function VariantCardSkeleton() {
  return (
    <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="mb-4 h-4 w-4/5" />
      <Skeleton className="mb-2 h-16 w-full" />
      <div className="mt-4 flex gap-1">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    </div>
  )
}
