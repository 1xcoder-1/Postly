import { useEffect } from 'react'
import { X } from 'lucide-react'

export interface Shortcut {
  keys: string[]
  label: string
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ['Ctrl', 'S'], label: 'Save the current variant as a draft (Generate)' },
  { keys: ['Ctrl', 'Enter'], label: 'Mark the selected variant ready (Generate)' },
  { keys: ['?'], label: 'Open / close this shortcuts panel' },
  { keys: ['Esc'], label: 'Close dialogs' }
]

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
      {children}
    </kbd>
  )
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2.5">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {s.keys.map((k, i) => (
                  <Key key={k}>
                    {i > 0 && <span className="mr-1 opacity-50">+</span>}
                    {k}
                  </Key>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
