import * as React from 'react'
import { cn } from '@/renderer/lib/utils'

interface StatCardProps {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

/** Dashboard metric tile: eyebrow label, big mono value, optional sub-hint. */
export function StatCard({ label, value, hint, icon, className }: StatCardProps) {
  return (
    <div className={cn('rounded-xl border bg-card p-5 shadow-card', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="mt-3 font-mono text-3xl font-bold leading-none">{value}</div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
