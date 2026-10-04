import { X, ShieldCheck, Mail, Code, CheckCircle2, GitBranch, Flame, Cpu } from 'lucide-react'
import { Button } from './ui/button'

interface UserProfileModalProps {
  onClose: () => void
}

export function UserProfileModal({ onClose }: UserProfileModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-[#27272a] bg-[#141416] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#232328] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#f06e1e] to-[#fb923c] font-bold text-white text-lg shadow-lg">
              P
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                Postly Pro Desktop
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </h2>
              <p className="text-xs text-muted-foreground">Local Free Tier · Multi-Model Router</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-xl border border-[#232328] bg-[#18181c] p-3">
              <span className="text-xs text-muted-foreground block">AI Text Chain</span>
              <span className="text-sm font-bold text-emerald-400 mt-0.5 block font-mono">5 Models</span>
            </div>
            <div className="rounded-xl border border-[#232328] bg-[#18181c] p-3">
              <span className="text-xs text-muted-foreground block">Crawlers</span>
              <span className="text-sm font-bold text-white mt-0.5 block font-mono">4 Sources</span>
            </div>
            <div className="rounded-xl border border-[#232328] bg-[#18181c] p-3">
              <span className="text-xs text-muted-foreground block">Google Cal</span>
              <span className="text-sm font-bold text-emerald-400 mt-0.5 block font-mono">Synced</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#232328] bg-[#18181c] p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-zinc-300">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Cpu className="h-3.5 w-3.5" /> Text Providers
              </span>
              <span className="font-mono text-zinc-200">Groq, Gemini, OpenRouter</span>
            </div>
            <div className="flex items-center justify-between text-zinc-300">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Flame className="h-3.5 w-3.5" /> Image Engine
              </span>
              <span className="font-mono text-zinc-200">Gemini, Cloudflare, HF</span>
            </div>
            <div className="flex items-center justify-between text-zinc-300">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Code className="h-3.5 w-3.5" /> Storage Mode
              </span>
              <span className="font-mono text-zinc-200">Local JSON / Neon DB</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-300">
              Encrypted API key storage active with OS keychain (safeStorage).
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-[#232328] pt-4">
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl border-[#2a2a30]">
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
