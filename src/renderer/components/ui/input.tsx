import * as React from 'react'
import { cn } from '@/renderer/lib/utils'

// MasterJi form fields: dark zinc-800 fill, 8px radius (login page) and slim ring focus.
const fieldBase =
  'flex w-full rounded-[8px] border border-input bg-zinc-800/40 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input ref={ref} type={type} className={cn(fieldBase, 'h-10', className)} {...props} />
  )
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, 'min-h-24 resize-y', className)} {...props} />
  )
)
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldBase, 'h-10 cursor-pointer pr-8 [&_option]:bg-popover [&_option]:text-foreground', className)} {...props}>
      {children}
    </select>
  )
)
Select.displayName = 'Select'

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('mb-1.5 block text-xs font-medium text-zinc-300 dark:text-zinc-300', className)} {...props} />
  )
)
Label.displayName = 'Label'
