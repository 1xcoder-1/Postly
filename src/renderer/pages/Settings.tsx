import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Database,
  KeyRound,
  Save,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Plug,
  RotateCcw,
  Cpu,
  Download,
  Upload,
  Info,
  SlidersHorizontal,
  Ban,
  CheckCircle2,
  AlertTriangle,
  LogIn,
  Loader2
} from 'lucide-react'
import { PLATFORMS, POST_STYLES, TONES, type Platform, type PostStyle, type Tone, type ModelUsage, type AccountSource, type AccountStatus } from '@shared/types'
import { api, type SettingsStatus } from '@/renderer/lib/api'
import { useTheme } from '@/renderer/theme'
import { Button } from '@/renderer/components/ui/button'

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

// Account-login crawling: paste fields (manual fallback for the in-app login).
// A full cookie jar is tolerated — main extracts the named cookie before saving.
const ACCOUNT_KEY_FIELDS = [
  { key: 'X_AUTH_TOKEN', label: 'X auth_token Cookie', placeholder: 'auth_token value or cookie jar' },
  { key: 'X_CT0', label: 'X ct0 Cookie', placeholder: 'ct0 value' },
  { key: 'LINKEDIN_LI_AT', label: 'LinkedIn li_at Cookie', placeholder: 'li_at value' },
  { key: 'REDDIT_COOKIE', label: 'Reddit token_v2 Cookie', placeholder: 'token_v2 JWT' }
]

// Per-source in-app login rows (X / LinkedIn / Reddit).
const ACCOUNT_SOURCE_ROWS: { source: AccountSource; label: string }[] = [
  { source: 'x', label: 'X (Twitter)' },
  { source: 'linkedin', label: 'LinkedIn' },
  { source: 'reddit', label: 'Reddit' }
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'keys' | 'models' | 'prefs' | 'about'>('keys')
  const [status, setStatus] = useState<SettingsStatus>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [tests, setTests] = useState<Record<string, { state: 'idle' | 'testing' | 'ok' | 'bad'; message: string }>>({})
  const [hasDb, setHasDb] = useState(false)
  const [saving, setSaving] = useState(false)
  const [models, setModels] = useState<ModelUsage[]>([])
  const [rejectionCount, setRejectionCount] = useState(0)
  const [version, setVersion] = useState('0.1.0')
  const [accountStatuses, setAccountStatuses] = useState<AccountStatus[]>([])
  const [loggingIn, setLoggingIn] = useState<AccountSource | null>(null)

  const [prefs, setPrefs] = useState({
    defaultPlatforms: 'x,linkedin',
    defaultStyle: 'educational',
    defaultTone: 'casual',
    carouselDefault: 'off'
  })

  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const fileRef = useRef<HTMLInputElement>(null)

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

  // Opens the in-app login window for a platform. On success we toast + refresh
  // the live status; on cancel (window closed) we silently do nothing.
  const loginAccount = async (source: AccountSource) => {
    setLoggingIn(source)
    try {
      const res = await api.accountsLogin(source)
      if (res.ok) {
        toast.success('Connected')
        await Promise.all([refresh(), refreshAccountStatus()])
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoggingIn(null)
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

  // Shared masked secret-row renderer (input + Test + Trash) reused by both the
  // API-key groups and the Account Logins card so behaviour stays identical.
  const renderKeyField = (key: string, label: string, placeholder: string) => {
    const info = status[key]
    const isSet = info?.configured
    const testState = tests[key]

    return (
      <div key={key} className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-300 block">{label}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={isSet ? `••••${info.last4} (${info.length} chars saved)` : placeholder}
            value={draft[key] ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
            className="w-full rounded-xl border border-[#27272a] bg-[#18181c] px-3.5 py-2 text-sm text-white placeholder-zinc-600 focus:border-primary focus:outline-none"
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => testKey(key)}
            disabled={testState?.state === 'testing'}
            title="Test key"
            className="h-9 w-9 rounded-xl border border-[#27272a] text-zinc-300 hover:border-primary hover:text-primary"
          >
            <Plug className="h-4 w-4" />
          </Button>
          {isSet && !draft[key] && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => clearKey(key)}
              title="Remove key"
              className="h-9 w-9 rounded-xl border border-[#27272a] text-zinc-400 hover:border-rose-500 hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {testState && testState.state !== 'idle' && (
          <p
            className={`font-mono text-[11px] ${
              testState.state === 'ok'
                ? 'text-emerald-400'
                : testState.state === 'bad'
                ? 'text-rose-400'
                : 'text-zinc-500'
            }`}
          >
            {testState.state === 'testing' ? 'Testing connection…' : testState.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            API keys, AI fallback router quotas, and posting defaults.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 text-emerald-400 px-3 py-1 text-xs font-medium">
            <ShieldCheck className="h-3.5 w-3.5" />
            OS-Encrypted
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-zinc-700/50 bg-zinc-800/60 text-zinc-300 px-3 py-1 text-xs font-medium">
            <Database className="h-3.5 w-3.5 text-zinc-400" />
            {hasDb ? 'Neon DB' : 'Local JSON'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-[#232328] pb-1">
        {[
          { id: 'keys', label: 'API Keys' },
          { id: 'models', label: 'AI Router & Quotas' },
          { id: 'prefs', label: 'Posting Preferences' },
          { id: 'about', label: 'About Postly' }
        ].map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`relative pb-3 text-sm font-semibold transition-colors ${
                isActive ? 'text-primary' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab 1: API Keys */}
      {activeTab === 'keys' && (
        <div className="space-y-6">
          {KEY_GROUPS.map((group) => (
            <div
              key={group.title}
              className="rounded-2xl border border-[#232328] bg-[#141417] p-5 shadow-lg space-y-4"
            >
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" /> {group.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-[#232328]">
                {group.keys.map(({ key, label, placeholder }) => renderKeyField(key, label, placeholder))}
              </div>
            </div>
          ))}

          {/* Account Logins (Personalized Feeds) */}
          <div className="rounded-2xl border border-[#232328] bg-[#141417] p-5 shadow-lg space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <LogIn className="h-4 w-4 text-primary" /> Account Logins (Personalized Feeds)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Connect your own X, LinkedIn or Reddit account to crawl a personalized feed. Cookies
                are encrypted and stored only on this device; crawling uses your account at low
                volume; platform rules may restrict automated access — use at your own risk.
              </p>
            </div>

            {/* Manual paste fallback (a full cookie jar is tolerated). */}
            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-[#232328]">
              {ACCOUNT_KEY_FIELDS.map(({ key, label, placeholder }) => renderKeyField(key, label, placeholder))}
            </div>

            {/* Per-source in-app login + live connection status. */}
            <div className="space-y-2.5 pt-2 border-t border-[#232328]">
              {ACCOUNT_SOURCE_ROWS.map(({ source, label }) => {
                const st = accountStatuses.find((a) => a.source === source)
                const busy = loggingIn === source
                const connected = !!st?.connected
                const expired = !!st?.configured && !connected
                const statusText = connected
                  ? st?.message || 'Connected'
                  : expired
                  ? st?.message || 'Session expired or invalid'
                  : 'Not connected'
                const statusClass = connected
                  ? 'text-emerald-400'
                  : expired
                  ? 'text-rose-400'
                  : 'text-zinc-500'

                return (
                  <div
                    key={source}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#27272a] bg-[#18181c] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{label}</div>
                      <div className={`text-xs mt-0.5 truncate ${statusClass}`}>{statusText}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => loginAccount(source)}
                      disabled={busy}
                      className="shrink-0 rounded-full border-[#2a2a30] text-xs hover:border-primary/40 hover:text-primary"
                    >
                      {busy ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LogIn className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {busy ? 'Waiting for sign-in…' : 'Login in app window'}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={saveKeys}
              disabled={saving}
              className="rounded-full bg-primary font-medium text-white shadow-lg hover:bg-primary/90 px-6"
            >
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? 'Encrypting & Saving…' : 'Save Keys'}
            </Button>
          </div>
        </div>
      )}

      {/* Tab 2: AI Models & Router Quotas */}
      {activeTab === 'models' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#232328] bg-[#141417] p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" /> Multi-Model Fallback Router
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatic failover chain with per-provider daily quotas and cooldown protection.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={resetUsage}
                className="rounded-full border-[#2a2a30] text-xs hover:border-primary/40"
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Reset Usage Counters
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-3 border-t border-[#232328]">
              {models.map((m) => (
                <div
                  key={m.provider}
                  className="rounded-xl border border-[#27272a] bg-[#18181c] p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">{m.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        m.available
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border border-rose-500/30 bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {m.available ? 'Ready' : 'Capped'}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-zinc-400 font-mono">
                    <div className="flex justify-between">
                      <span>Type:</span>
                      <span className="text-zinc-200 capitalize">{m.kind}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Calls Today:</span>
                      <span className="text-orange-400 font-bold">
                        {m.callsToday} / {m.dailyCap}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Key Status:</span>
                      <span className={m.hasKey ? 'text-emerald-400' : 'text-zinc-500'}>
                        {m.hasKey ? 'Configured' : 'Keyless Free Tier'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#232328] bg-[#141417] p-5 shadow-lg flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
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
              className="rounded-full border-[#2a2a30] text-xs hover:border-rose-500 hover:text-rose-400"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Clear Memory
            </Button>
          </div>
        </div>
      )}

      {/* Tab 3: Preferences */}
      {activeTab === 'prefs' && (
        <div className="rounded-2xl border border-[#232328] bg-[#141417] p-5 shadow-lg space-y-5">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" /> Generation & Publishing Defaults
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Default preferences pre-selected when generating new social content.
            </p>
          </div>

          <div className="space-y-4 pt-3 border-t border-[#232328]">
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-2">Default Active Platforms</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((pl) => (
                  <button
                    key={pl}
                    type="button"
                    onClick={() => togglePlatform(pl)}
                    className={`rounded-full border px-3.5 py-1 text-xs font-mono capitalize transition-all ${
                      selectedPlatforms.has(pl)
                        ? 'border-primary bg-primary/20 text-primary font-bold shadow'
                        : 'border-[#27272a] bg-[#18181c] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {pl}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Default Post Style</label>
                <select
                  value={prefs.defaultStyle}
                  onChange={(e) => savePref({ defaultStyle: e.target.value as any })}
                  className="w-full rounded-xl border border-[#27272a] bg-[#18181c] px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary capitalize"
                >
                  {POST_STYLES.map((st) => (
                    <option key={st} value={st} className="capitalize">{st}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Default Tone of Voice</label>
                <select
                  value={prefs.defaultTone}
                  onChange={(e) => savePref({ defaultTone: e.target.value as any })}
                  className="w-full rounded-xl border border-[#27272a] bg-[#18181c] px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary capitalize"
                >
                  {TONES.map((tn) => (
                    <option key={tn} value={tn} className="capitalize">{tn}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2.5 text-sm text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.carouselDefault === 'on'}
                  onChange={(e) => savePref({ carouselDefault: e.target.checked ? 'on' : 'off' })}
                  className="h-4 w-4 rounded border-[#27272a] bg-[#18181c] accent-[#f06e1e]"
                />
                <span>Generate Carousel slides copy by default</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: About Postly */}
      {activeTab === 'about' && (
        <div className="rounded-2xl border border-[#232328] bg-[#141417] p-6 shadow-lg space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#f06e1e] to-[#fb923c] font-bold text-white text-2xl shadow-lg">
              P
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Postly Desktop</h3>
              <p className="text-xs text-muted-foreground">Version {version} · Free & Open-Source Desktop App</p>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[#232328] text-xs leading-relaxed text-zinc-300">
            <p>
              Postly helps software engineers and tech creators draft, schedule, and publish daily social content about AI, developer tools, and tech trends with automatic web crawlers and multi-model AI routing.
            </p>
            <div className="rounded-xl border border-[#27272a] bg-[#18181c] p-4 space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-400">Desktop Shell:</span>
                <span className="text-zinc-200">Electron + Vite + React 19 + TypeScript</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Security Architecture:</span>
                <span className="text-emerald-400">Context Isolation ON · CSP Enforced · safeStorage Encrypted</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Google Calendar:</span>
                <span className="text-emerald-400">1-Click Direct Synchronization & .ics Export</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
