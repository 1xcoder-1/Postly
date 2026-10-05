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

/** Pill segmented control — flat orange active segment (MasterJi tabs). */
export function Segmented({ options, value, onChange, className }: SegmentedProps) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors',
              active
                ? 'bg-primary font-medium text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.label}
            {typeof o.count === 'number' && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px]',
                  active ? 'bg-black/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
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
