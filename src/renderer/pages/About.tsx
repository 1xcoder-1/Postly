import { useEffect, useState } from 'react'
import { Info, RefreshCw, Keyboard, ShieldCheck, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/renderer/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/renderer/components/ui/card'
import { Button } from '@/renderer/components/ui/button'
import { Badge } from '@/renderer/components/ui/badge'
import { PageHeader } from '@/renderer/components/ui/PageHeader'
import { SHORTCUTS } from '@/renderer/components/ShortcutsDialog'

const STACK = [
  'Electron + React + TypeScript + Vite (electron-vite)',
  'Tailwind CSS + shadcn-style primitives, Zustand state',
  'Neon Postgres + Drizzle ORM, with a local JSON fallback',
  'Multi-model AI with automatic fallback (all free tiers)',
  'Python topic crawlers via child_process (argv, no shell)'
]

export default function About() {
  const [version, setVersion] = useState('')

  useEffect(() => {
    api.appVersion().then(setVersion).catch(() => {})
  }, [])

  return (
    <div>
      <PageHeader title="About" description="What Postly is, how it is built, and how it handles your data." />

      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 text-2xl">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Postly</h2>
                <Badge variant="secondary">v{version || '0.1.0'}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                A free desktop studio for drafting, scheduling and posting daily AI / dev / tech content.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4" /> Built with
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {STACK.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" /> Privacy &amp; security
            </CardTitle>
            <CardDescription>100% local, free-tier only, no analytics — by design.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>API keys are encrypted at rest with your OS keychain (Electron safeStorage) and never sent to the renderer as raw text.</p>
            <p>The app makes no background network calls except the AI/crawler providers you explicitly configure.</p>
            <p>External links open only to the official platform domains, through an allow-list in the main process.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Keyboard className="h-4 w-4" /> Keyboard shortcuts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {SHORTCUTS.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCw className="h-4 w-4" /> Updates
              </CardTitle>
              <CardDescription>Auto-update is a placeholder in this free build.</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                const r = await api.checkForUpdates()
                toast.message(r.message)
              }}
            >
              Check for updates
            </Button>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
