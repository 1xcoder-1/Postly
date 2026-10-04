import { useEffect, useState } from 'react'
import { Cpu, RefreshCw, Radio, CheckCircle2, AlertTriangle, XCircle, ShieldCheck, Zap, History } from 'lucide-react'
import type { ModelUsage, GenerationLogEntry, AgentReachChannel } from '@shared/types'
import { api } from '@/renderer/lib/api'
import { Button } from '@/renderer/components/ui/button'
import { toast } from 'sonner'

export default function AiModels() {
  const [models, setModels] = useState<ModelUsage[]>([])
  const [logs, setLogs] = useState<GenerationLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [arStatus, setArStatus] = useState<Record<string, AgentReachChannel> | null>(null)
  const [checkingAr, setCheckingAr] = useState(false)

  const refreshAiStatus = async () => {
    setLoading(true)
    try {
      const res = await api.aiStatus()
      setModels(res.models)
      setLogs(res.recent)
      toast.success('AI router and model usage refreshed')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const checkAgentReach = async (refresh = false) => {
    setCheckingAr(true)
    try {
      const res = await api.agentReachStatus(refresh)
      setArStatus(res.status)
      toast.success('Agent Reach channels probed')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCheckingAr(false)
    }
  }

  useEffect(() => {
    refreshAiStatus()
    checkAgentReach(false)
  }, [])

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            AI Models & Router
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
              MULTI-MODEL FALLBACK ACTIVE
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor multi-provider fallback chains (Groq → Gemini → OpenRouter → Cloudflare → Pollinations), daily caps & cooldowns.
          </p>
        </div>

        <Button
          onClick={refreshAiStatus}
          disabled={loading}
          className="rounded-full bg-primary font-medium text-white hover:bg-primary/90 shadow-md"
        >
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Refreshing…' : 'Refresh Usage'}
        </Button>
      </div>

      {/* Models Grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" /> Connected Model Providers
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => (
            <div
              key={m.provider}
              className="group rounded-2xl border border-[#232328] bg-[#141417] p-5 shadow-lg transition-all hover:border-[#f06e1e]/50 hover:bg-[#18181c]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="rounded-full border border-zinc-700/50 bg-zinc-800/60 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300 uppercase">
                    {m.kind}
                  </span>
                  <h3 className="mt-2 text-base font-bold text-white group-hover:text-primary transition-colors">
                    {m.label}
                  </h3>
                </div>

                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    m.available
                      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border border-rose-500/30 bg-rose-500/10 text-rose-400'
                  }`}
                >
                  {m.available ? 'Ready' : 'Unavailable'}
                </span>
              </div>

              <div className="mt-4 space-y-2 border-t border-[#232328] pt-3 text-xs text-zinc-400 font-mono">
                <div className="flex justify-between">
                  <span>Daily Quota:</span>
                  <span className="text-zinc-200 font-bold">
                    {m.callsToday} / {m.dailyCap} calls
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>API Key Configured:</span>
                  <span className={m.hasKey ? 'text-emerald-400' : 'text-zinc-500'}>
                    {m.hasKey ? 'Yes (Encrypted)' : 'No (Key Free Tier)'}
                  </span>
                </div>
                {m.coolingDown && (
                  <div className="flex items-center gap-1 text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" /> Cooling down after errors
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Reach Doctor Channels */}
      <div className="rounded-2xl border border-[#232328] bg-[#141417] p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" /> Agent Reach Crawler Channels
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live crawler health for YouTube, Hacker News, Reddit, RSS & Jina Reader.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkAgentReach(true)}
            disabled={checkingAr}
            className="rounded-full border-[#2a2a30] text-xs hover:border-primary/40"
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${checkingAr ? 'animate-spin' : ''}`} />
            {checkingAr ? 'Probing…' : 'Re-check Channels'}
          </Button>
        </div>

        {arStatus ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(arStatus).map(([name, ch]) => (
              <div
                key={name}
                className="rounded-xl border border-[#27272a] bg-[#18181c] p-3.5 text-xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200 capitalize">{name}</span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      ch.status === 'ok'
                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                        : ch.status === 'warn'
                        ? 'bg-amber-400'
                        : 'bg-zinc-600'
                    }`}
                  />
                </div>
                <span className="mt-2 text-[11px] text-zinc-400 truncate">
                  {ch.active_backend ? `Backend: ${ch.active_backend}` : ch.message || 'Ready'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 font-mono">No channel report available yet.</p>
        )}
      </div>

      {/* Recent AI Router Logs */}
      {logs.length > 0 && (
        <div className="rounded-2xl border border-[#232328] bg-[#141417] p-5 shadow-lg">
          <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Recent Generation Router Logs
          </h2>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {logs.slice(0, 10).map((entry, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-xl border border-[#27272a] bg-[#18181c] px-3.5 py-2.5 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      entry.outcome === 'used'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {entry.outcome}
                  </span>
                  <span className="font-mono text-zinc-200">{entry.provider}</span>
                  <span className="text-zinc-500">({entry.kind})</span>
                </div>
                <span className="font-mono text-zinc-500 text-[11px]">
                  {new Date(entry.at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
