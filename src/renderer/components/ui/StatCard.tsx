import * as React from 'react'
import { cn } from '@/renderer/lib/utils'

interface StatCardProps {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

/** MasterJi stat tile: Montserrat 20px title, Palanquin 36px number, 12px hint. */
export function StatCard({ label, value, hint, icon, className }: StatCardProps) {
  return (
    <div className={cn('rounded-[14px] border border-border bg-card p-4 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-title text-xl font-medium leading-7 tracking-tight">{label}</span>
        {icon && <span className="mt-1 text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</span>}
      </div>
      <div className="mt-2 px-1 font-num text-4xl font-medium leading-10">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
