// Startup validation of environment variables / API keys.
// Everything is OPTIONAL (free-tier users add keys incrementally), so this is
// non-fatal: it only reports problems. It guards against malformed values that
// would otherwise surface as confusing provider errors deep in a request.

export interface EnvIssue {
  key: string
  level: 'error' | 'warn'
  message: string
}

export interface EnvReport {
  issues: EnvIssue[]
  configured: string[]
}

type Rule = { pattern: RegExp; hint: string }

// Loose shape checks — a wrong prefix almost always means a copy/paste slip.
const RULES: Record<string, Rule> = {
  DATABASE_URL: { pattern: /^postgres(ql)?:\/\//i, hint: 'must start with postgres:// or postgresql://' },
  GROQ_API_KEY: { pattern: /^gsk_/, hint: 'Groq keys start with gsk_' },
  GEMINI_API_KEY: { pattern: /^AIza/, hint: 'Gemini keys start with AIza' },
  OPENROUTER_API_KEY: { pattern: /^sk-or-/, hint: 'OpenRouter keys start with sk-or-' },
  HUGGINGFACE_API_KEY: { pattern: /^hf_/, hint: 'Hugging Face tokens start with hf_' },
  CLOUDFLARE_API_TOKEN: { pattern: /^[A-Za-z0-9_-]{12,}$/, hint: 'looks too short to be a Cloudflare token' }
}

export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const issues: EnvIssue[] = []
  const configured: string[] = []

  for (const [key, rule] of Object.entries(RULES)) {
    const value = (env[key] ?? '').trim()
    if (!value) continue // not set is fine
    configured.push(key)
    if (!rule.pattern.test(value)) {
      // Log only the key and the reason — never the value itself.
      issues.push({ key, level: 'warn', message: `${key} may be invalid: ${rule.hint}` })
    }
  }

  // Cloudflare pairing: account id + token must both exist or neither is usable.
  const cfToken = (env.CLOUDFLARE_API_TOKEN ?? '').trim()
  const cfAccount = (env.CLOUDFLARE_ACCOUNT_ID ?? '').trim()
  if (cfToken && !cfAccount)
    issues.push({ key: 'CLOUDFLARE_ACCOUNT_ID', level: 'error', message: 'token set but CLOUDFLARE_ACCOUNT_ID missing' })
  if (cfAccount && !cfToken)
    issues.push({ key: 'CLOUDFLARE_API_TOKEN', level: 'error', message: 'account id set but CLOUDFLARE_API_TOKEN missing' })

  // Reddit needs the trio together.
  const redditSet = ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USER_AGENT'].filter((k) => (env[k] ?? '').trim())
  if (redditSet.length > 0 && redditSet.length < 3) {
    issues.push({ key: 'REDDIT', level: 'warn', message: 'Reddit crawler needs CLIENT_ID, CLIENT_SECRET and USER_AGENT together' })
  }

  // X account-login crawling needs the auth_token + ct0 cookie PAIR together.
  // Warn (not error): each is useless alone, but a partial paste is recoverable.
  const xAuth = (env.X_AUTH_TOKEN ?? '').trim()
  const xCt0 = (env.X_CT0 ?? '').trim()
  if (xAuth && !xCt0)
    issues.push({ key: 'X_CT0', level: 'warn', message: 'X_AUTH_TOKEN set but X_CT0 missing — X login crawling needs both cookies' })
  if (xCt0 && !xAuth)
    issues.push({ key: 'X_AUTH_TOKEN', level: 'warn', message: 'X_CT0 set but X_AUTH_TOKEN missing — X login crawling needs both cookies' })

  return { issues, configured }
}

/** Prints a concise, secret-free summary to the main-process console. */
export function reportEnv(report: EnvReport): void {
  console.log(`[env] ${report.configured.length} key(s) configured: ${report.configured.join(', ') || 'none'}`)
  for (const issue of report.issues) {
    const line = `[env ${issue.level.toUpperCase()}] ${issue.key}: ${issue.message}`
    issue.level === 'error' ? console.warn(line) : console.info(line)
  }
}
