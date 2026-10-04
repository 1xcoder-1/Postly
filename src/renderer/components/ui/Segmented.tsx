import * as React from 'react'
import { cn } from '@/renderer/lib/utils'

export interface SegmentOption {
  value: string
  label: string
  count?: number
}

interface SegmentedProps {
  options: SegmentOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Pill segmented control (e.g. Active / Archived) with an orange active tab. */
export function Segmented({ options, value, onChange, className }: SegmentedProps) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-lg border bg-card p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {o.label}
            {typeof o.count === 'number' && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 font-mono text-[10px]',
                  active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
