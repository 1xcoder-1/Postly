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
// Only Gemini is used for AI now, so just its key (plus the DB URL) is checked.
const RULES: Record<string, Rule> = {
  DATABASE_URL: { pattern: /^postgres(ql)?:\/\//i, hint: 'must start with postgres:// or postgresql://' },
  GEMINI_API_KEY: { pattern: /^(AIza|AQ\.)/, hint: 'Gemini keys start with AIza (classic) or AQ. (new AI Studio format)' }
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
