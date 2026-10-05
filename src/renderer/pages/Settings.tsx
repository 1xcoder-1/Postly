import { useEffect, useState, type ComponentType } from 'react'
import { toast } from 'sonner'
import {
  Database,
  KeyRound,
  Save,
  ShieldCheck,
  Trash2,
  Plug,
  RotateCcw,
  Cpu,
  SlidersHorizontal,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  RefreshCw,
  Globe
} from 'lucide-react'
import { PLATFORMS, POST_STYLES, TONES, type Platform, type PostStyle, type Tone, type ModelUsage, type AccountSource, type AccountStatus } from '@shared/types'
import { api, type SettingsStatus } from '@/renderer/lib/api'
import { Button } from '@/renderer/components/ui/button'
import { Input, Select, Label } from '@/renderer/components/ui/input'
import { PageHeader } from '@/renderer/components/ui/PageHeader'
import { GithubIcon, XIcon, LinkedinIcon, RedditIcon } from '@/renderer/components/BrandIcons'

const KEY_GROUPS = [
  {
    title: 'Text AI Keys',
    description: 'Auto-fallback chain: Groq → Gemini → OpenRouter → Cloudflare → Pollinations (Free)',
    keys: [
      { key: 'GROQ_API_KEY', label: 'Groq API Key', placeholder: 'gsk_…' },
      { key: 'GEMINI_API_KEY', label: 'Google Gemini API Key', placeholder: 'AIza…' },
      { key: 'OPENROUTER_API_KEY', label: 'OpenRouter API Key', placeholder: 'sk-or-…' },
      { key: 'CLOUDFLARE_API_TOKEN', label: 'Cloudflare Workers AI Token', placeholder: 'token' },
      { key: 'CLOUDFLARE_ACCOUNT_ID', label: 'Cloudflare Account ID', placeholder: 'account id' }
    ]
  },
  {
    title: 'Image AI & Crawlers',
    description: 'Hugging Face for image generation and Reddit crawler API access',
    keys: [
      { key: 'HUGGINGFACE_API_KEY', label: 'Hugging Face Token', placeholder: 'hf_…' },
      { key: 'REDDIT_CLIENT_ID', label: 'Reddit Client ID', placeholder: 'optional' },
      { key: 'REDDIT_CLIENT_SECRET', label: 'Reddit Client Secret', placeholder: 'optional' }
    ]
  },
  {
    title: 'Database Connection',
    description: 'Neon serverless Postgres (leave blank for local JSON database)',
    keys: [{ key: 'DATABASE_URL', label: 'Postgres Connection String', placeholder: 'postgres://…' }]
  }
]

// Per-source account integration rows (X / LinkedIn / Reddit / GitHub).
const ACCOUNT_SOURCE_ROWS: {
  source: AccountSource
  label: string
  icon: ComponentType<{ className?: string }>
  hint: string
}[] = [
  {
    source: 'github',
    label: 'GitHub',
    icon: GithubIcon,
    hint: 'Opens GitHub App Access & Token Authorization for Postly'
  },
  {
    source: 'x',
    label: 'X (Twitter)',
    icon: XIcon,
    hint: 'Opens X Connected Apps & Account Permissions'
  },
  {
    source: 'linkedin',
    label: 'LinkedIn',
    icon: LinkedinIcon,
    hint: 'Opens LinkedIn Account Access & Permitted Integrations'
  },
  {
    source: 'reddit',
    label: 'Reddit',
    icon: RedditIcon,
    hint: 'Opens Reddit Authorized Apps & Account Access'
  }
]

const TABS: { id: 'keys' | 'models' | 'prefs' | 'about'; label: string }[] = [
  { id: 'keys', label: 'Web Accounts & API Keys' },
  { id: 'models', label: 'AI Router & Quotas' },
  { id: 'prefs', label: 'Posting Preferences' },
  { id: 'about', label: 'About Postly' }
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'keys' | 'models' | 'prefs' | 'about'>('keys')
  const [status, setStatus] = useState<SettingsStatus>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [connectingSource, setConnectingSource] = useState<string | null>(null)
  const [tests, setTests] = useState<Record<string, { state: 'idle' | 'testing' | 'ok' | 'bad'; message: string }>>({})
  const [hasDb, setHasDb] = useState(false)
  const [saving, setSaving] = useState(false)
  const [models, setModels] = useState<ModelUsage[]>([])
  const [rejectionCount, setRejectionCount] = useState(0)
  const [version, setVersion] = useState('0.1.0')
  const [accountStatuses, setAccountStatuses] = useState<AccountStatus[]>([])

  const [prefs, setPrefs] = useState({
    defaultPlatforms: 'x,linkedin',
    defaultStyle: 'educational',
    defaultTone: 'casual',
    carouselDefault: 'off'
  })

  const refresh = async () => {
    try {
      const [s, db, ai, p, r, v] = await Promise.all([
        api.getSettings(),
        api.hasDatabase(),
        api.aiStatus(),
        api.getPrefs(),
        api.rejectionCount(),
        api.appVersion()
      ])
      setStatus(s)
      setHasDb(db)
      setModels(ai.models)
      if (p) {
        setPrefs({
          defaultPlatforms: p.defaultPlatforms || 'x,linkedin',
          defaultStyle: p.defaultStyle || 'educational',
          defaultTone: p.defaultTone || 'casual',
          carouselDefault: p.carouselDefault === 'on' ? 'on' : 'off'
        })
      }
      setRejectionCount(r)
      setVersion(v || '0.1.0')
    } catch {}
  }

  useEffect(() => {
    refresh()
    refreshAccountStatus()
  }, [])

  const refreshAccountStatus = async () => {
    try {
      setAccountStatuses(await api.accountsStatus())
    } catch {}
  }

  const saveKeys = async () => {
    setSaving(true)
    try {
      const patch = Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim() !== ''))
      await api.setSettings(patch)
      setDraft({})
      setTests({})
      await Promise.all([refresh(), refreshAccountStatus()])
      toast.success('Keys encrypted with OS Keychain & saved!')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const clearKey = async (key: string) => {
    try {
      await api.setSettings({ [key]: '' })
      await refresh()
      toast.success('Key removed')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const testKey = async (key: string) => {
    setTests((prev) => ({ ...prev, [key]: { state: 'testing', message: '' } }))
    try {
      const res = await api.testKey(key)
      setTests((prev) => ({ ...prev, [key]: { state: res.ok ? 'ok' : 'bad', message: res.message } }))
    } catch (e) {
      setTests((prev) => ({ ...prev, [key]: { state: 'bad', message: (e as Error).message } }))
    }
  }

  const connectWithBrowser = async (row: typeof ACCOUNT_SOURCE_ROWS[0]) => {
    setConnectingSource(row.source)
    try {
      toast.info(`Opening ${row.label} in your browser… Please click Authorize/Continue on the web page.`, { duration: 6000 })
      const res = await api.accountsLogin(row.source)
      if (res.ok) {
        await Promise.all([refresh(), refreshAccountStatus()])
        toast.success(`Connected to ${row.label} successfully!`)
      } else if (res.error && res.error !== 'cancelled') {
        toast.error(res.error)
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setConnectingSource(null)
    }
  }

  const disconnectAccount = async (row: typeof ACCOUNT_SOURCE_ROWS[0]) => {
    if (!window.confirm(`Disconnect ${row.label}? This will remove saved session credentials from this device.`)) return
    try {
      const patch: Record<string, string> = {}
      if (row.source === 'x') {
        patch['X_AUTH_TOKEN'] = ''
        patch['X_CT0'] = ''
      } else if (row.source === 'linkedin') {
        patch['LINKEDIN_LI_AT'] = ''
      } else if (row.source === 'reddit') {
        patch['REDDIT_COOKIE'] = ''
      } else if (row.source === 'github') {
        patch['GITHUB_TOKEN'] = ''
      }
      await api.setSettings(patch)
      await Promise.all([refresh(), refreshAccountStatus()])
      toast.success(`${row.label} disconnected`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const verifyAccount = async (row: typeof ACCOUNT_SOURCE_ROWS[0]) => {
    setConnectingSource(row.source)
    try {
      toast.info(`Verifying live ${row.label} session…`)
      const updatedStatuses = await api.accountsStatus()
      setAccountStatuses(updatedStatuses)
      await refresh()
      const st = updatedStatuses.find((a) => a.source === row.source)
      if (st?.connected) {
        toast.success(`Verified: ${st.message || 'Session is active'}`)
      } else {
        toast.error(st?.message || 'Session expired or invalid')
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setConnectingSource(null)
    }
  }

  const savePref = async (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try {
      await api.setPref('defaultPlatforms', next.defaultPlatforms)
      await api.setPref('defaultStyle', next.defaultStyle)
      await api.setPref('defaultTone', next.defaultTone)
      await api.setPref('carouselDefault', next.carouselDefault)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const togglePlatform = (p: Platform) => {
    const set = new Set(prefs.defaultPlatforms.split(',').filter(Boolean) as Platform[])
    if (set.has(p)) set.delete(p)
    else set.add(p)
    savePref({ defaultPlatforms: [...set].join(',') })
  }

  const resetUsage = async () => {
    await api.resetAiUsage()
    const s = await api.aiStatus()
    setModels(s.models)
    toast.success('Daily usage counters reset')
  }

  const clearRejections = async () => {
    if (!window.confirm('Clear AI rejection learning history?')) return
    await api.clearRejections()
    setRejectionCount(0)
    toast.success('Rejection memory cleared')
  }

  const selectedPlatforms = new Set(prefs.defaultPlatforms.split(',').filter(Boolean) as Platform[])

  const renderKeyField = (key: string, label: string, placeholder: string) => {
    const info = status[key]
    const isSet = info?.configured
    const testState = tests[key]

    return (
      <div key={key} className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex items-center gap-1.5">
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={isSet ? `••••${info.last4} (${info.length} chars saved)` : placeholder}
            value={draft[key] ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          />
          <Button
            size="icon"
            variant="outline"
            onClick={() => testKey(key)}
            disabled={testState?.state === 'testing'}
            title="Test key"
            className="hover:border-primary hover:text-primary"
          >
            <Plug className="h-4 w-4" />
          </Button>
          {isSet && !draft[key] && (
            <Button
              size="icon"
              variant="outline"
              onClick={() => clearKey(key)}
              title="Remove key"
              className="hover:border-rose-500 hover:text-rose-500"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {testState && testState.state !== 'idle' && (
          <p
            className={`font-mono text-[11px] ${
              testState.state === 'ok'
                ? 'text-emerald-600 dark:text-emerald-400'
                : testState.state === 'bad'
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-muted-foreground'
            }`}
          >
            {testState.state === 'testing' ? 'Testing connection…' : testState.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl animate-in fade-in duration-200">
      <PageHeader
        title="Settings"
        description="Account connections, API keys, and AI fallback quotas."
        actions={
          <>
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              OS-Encrypted
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              {hasDb ? 'Neon DB' : 'Local JSON'}
            </span>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative pb-3 text-sm font-medium transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab 1: Accounts & API Keys */}
      {activeTab === 'keys' && (
        <div className="mt-6 space-y-6">
          {/* Web Accounts (Browser OAuth Flow) */}
          <section className="rounded-[14px] border border-border bg-card p-5 shadow-sm space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-title text-base font-medium text-foreground flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" /> Connected Web Accounts (Live Crawling)
                </h3>
                <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  Browser OAuth 2.0
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Click <strong className="text-foreground">“Connect on Browser”</strong> to authorize Postly in your web browser. Click <strong className="text-foreground">Continue / Authorize</strong> on the website, and Postly will automatically connect and show the 200 OK success page.
              </p>
            </div>

            {/* Per-source Web Connection Cards */}
            <div className="grid gap-3.5 sm:grid-cols-2 pt-4 border-t border-border">
              {ACCOUNT_SOURCE_ROWS.map((row) => {
                const { source, label, icon: Icon, hint } = row
                const st = accountStatuses.find((a) => a.source === source)
                const isConnecting = connectingSource === source
                const configured = !!st?.configured
                const connected = !!st?.connected
                const expired = configured && !connected

                return (
                  <div
                    key={source}
                    className={`rounded-lg border p-4 flex flex-col justify-between space-y-3 transition-colors ${
                      connected
                        ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                        : expired
                        ? 'border-rose-500/30 bg-rose-500/[0.06]'
                        : 'border-border bg-zinc-800/40'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/80">
                            <Icon className="h-5 w-5 text-foreground" />
                          </span>
                          <div>
                            <h4 className="text-sm font-medium text-foreground">{label}</h4>
                            <p className="text-[11px] text-muted-foreground line-clamp-1">{hint}</p>
                          </div>
                        </div>

                        {connected ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Active
                          </span>
                        ) : expired ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="h-3 w-3" />
                            Expired
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Disconnected
                          </span>
                        )}
                      </div>

                      {st?.message && (
                        <div className={`text-xs font-mono rounded-lg px-2.5 py-1.5 border ${
                          connected
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        }`}>
                          {st.message}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-border/60">
                      <Button
                        size="sm"
                        variant={connected ? 'secondary' : 'default'}
                        onClick={() => connectWithBrowser(row)}
                        disabled={isConnecting}
                        className="flex-1"
                      >
                        {isConnecting ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {isConnecting ? 'Waiting for 200 OK…' : connected ? 'Reconnect' : `Connect ${label}`}
                      </Button>

                      {configured && (
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => verifyAccount(row)}
                          disabled={isConnecting}
                          title="Verify live session status"
                          className="h-8 w-8 hover:border-primary hover:text-primary"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                        </Button>
                      )}

                      {configured && (
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => disconnectAccount(row)}
                          title="Disconnect and clear saved session"
                          className="h-8 w-8 hover:border-rose-500 hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* AI Providers & DB Key Groups */}
          {KEY_GROUPS.map((group) => (
            <section
              key={group.title}
              className="rounded-[14px] border border-border bg-card p-5 shadow-sm space-y-4"
            >
              <div>
                <h3 className="font-title text-base font-medium text-foreground flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" /> {group.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-4 border-t border-border">
                {group.keys.map(({ key, label, placeholder }) => renderKeyField(key, label, placeholder))}
              </div>
            </section>
          ))}

          <div className="flex justify-end pt-2">
            <Button onClick={saveKeys} disabled={saving}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? 'Encrypting & Saving…' : 'Save Keys'}
            </Button>
          </div>
        </div>
      )}

      {/* Tab 2: AI Models & Router Quotas */}
      {activeTab === 'models' && (
        <div className="mt-6 space-y-6">
          <section className="rounded-[14px] border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-title text-base font-medium text-foreground flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" /> Multi-Model Fallback Router
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatic failover chain with per-provider daily quotas and cooldown protection.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={resetUsage}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Reset Usage Counters
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-4 border-t border-border">
              {models.map((m) => (
                <div
                  key={m.provider}
                  className="rounded-lg border border-border bg-zinc-800/40 p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{m.label}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        m.available
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {m.available ? 'Ready' : 'Capped'}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground font-mono">
                    <div className="flex justify-between">
                      <span>Type:</span>
                      <span className="text-foreground capitalize">{m.kind}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Calls Today:</span>
                      <span className="text-primary font-medium">
                        {m.callsToday} / {m.dailyCap}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Key Status:</span>
                      <span className={m.hasKey ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                        {m.hasKey ? 'Configured' : 'Keyless Free Tier'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[14px] border border-border bg-card p-5 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="font-title text-base font-medium text-foreground flex items-center gap-2">
                <Ban className="h-4 w-4 text-primary" /> Rejection Learning Memory
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {rejectionCount} rejected posts stored as negative examples for prompt tuning.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={clearRejections}
              disabled={rejectionCount === 0}
              className="hover:border-rose-500 hover:text-rose-500"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Clear Memory
            </Button>
          </section>
        </div>
      )}

      {/* Tab 3: Preferences */}
      {activeTab === 'prefs' && (
        <section className="mt-6 rounded-[14px] border border-border bg-card p-5 shadow-sm space-y-5">
          <div>
            <h3 className="font-title text-base font-medium text-foreground flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" /> Generation & Publishing Defaults
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Default preferences pre-selected when generating new social content.
            </p>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <div>
              <Label>Default Active Platforms</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((pl) => (
                  <button
                    key={pl}
                    type="button"
                    onClick={() => togglePlatform(pl)}
                    className={`rounded-full border px-3.5 py-1 text-xs capitalize transition-colors ${
                      selectedPlatforms.has(pl)
                        ? 'border-primary bg-primary/15 font-medium text-primary'
                        : 'border-border bg-zinc-800/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {pl}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Default Post Style</Label>
                <Select
                  value={prefs.defaultStyle}
                  onChange={(e) => savePref({ defaultStyle: e.target.value as PostStyle })}
                >
                  {POST_STYLES.map((st) => (
                    <option key={st} value={st} className="capitalize">{st}</option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Default Tone of Voice</Label>
                <Select
                  value={prefs.defaultTone}
                  onChange={(e) => savePref({ defaultTone: e.target.value as Tone })}
                >
                  {TONES.map((tn) => (
                    <option key={tn} value={tn} className="capitalize">{tn}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="pt-2">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={prefs.carouselDefault === 'on'}
                  onChange={(e) => savePref({ carouselDefault: e.target.checked ? 'on' : 'off' })}
                  className="h-4 w-4 rounded border-border bg-zinc-800/40 accent-primary"
                />
                <span>Generate Carousel slides copy by default</span>
              </label>
            </div>
          </div>
        </section>
      )}

      {/* Tab 4: About Postly */}
      {activeTab === 'about' && (
        <section className="mt-6 rounded-[14px] border border-border bg-card p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-primary font-num text-2xl font-semibold text-primary-foreground">
              P
            </div>
            <div>
              <h3 className="font-title text-lg font-medium text-foreground">Postly Desktop</h3>
              <p className="text-xs text-muted-foreground">Version {version} · Free & Open-Source Desktop App</p>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-border text-xs leading-relaxed text-muted-foreground">
            <p>
              Postly helps software engineers and tech creators draft, schedule, and publish daily social content about AI, developer tools, and tech trends with automatic web crawlers and multi-model AI routing.
            </p>
            <div className="rounded-lg border border-border bg-zinc-800/40 p-4 space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Desktop Shell:</span>
                <span className="text-foreground">Electron + Vite + React 19 + TypeScript</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Security Architecture:</span>
                <span className="text-emerald-600 dark:text-emerald-400">Context Isolation ON · CSP Enforced · safeStorage Encrypted</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Google Calendar:</span>
                <span className="text-emerald-600 dark:text-emerald-400">1-Click Direct Synchronization & .ics Export</span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
