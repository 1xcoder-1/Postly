import http from 'node:http'
import { shell } from 'electron'
import { setSettings } from '../../backend/services/settingsService'
import { invalidateAccountStatusCache } from '../../backend/services/accountStatus'
import type { AccountSource } from '../shared/types'

const OAUTH_PORT = 4321

const AUTH_CONFIG: Record<
  AccountSource,
  {
    name: string
    icon: string
    color: string
    actionUrl: string
    actionText: string
    inputLabel: string
    placeholder: string
    hint: string
  }
> = {
  github: {
    name: 'GitHub',
    icon: '🐙',
    color: '#2ea44f',
    actionUrl: 'https://github.com/settings/tokens/new?description=Postly&scopes=repo,read:user',
    actionText: '1. Open GitHub Authorization Page ↗',
    inputLabel: 'Personal Access Token',
    placeholder: 'ghp_… or user_session',
    hint: 'Click the button above to generate a token with repo & read:user scopes, then paste it here.'
  },
  x: {
    name: 'X (Twitter)',
    icon: '🌐',
    color: '#1d9bf0',
    actionUrl: 'https://x.com',
    actionText: '1. Open X (Twitter) in Browser ↗',
    inputLabel: 'auth_token Cookie',
    placeholder: 'Paste auth_token or full cookie jar',
    hint: 'Log in on x.com, copy auth_token from DevTools (Application → Cookies), and paste here.'
  },
  linkedin: {
    name: 'LinkedIn',
    icon: '💼',
    color: '#0a66c2',
    actionUrl: 'https://www.linkedin.com',
    actionText: '1. Open LinkedIn in Browser ↗',
    inputLabel: 'li_at Cookie',
    placeholder: 'Paste li_at cookie value',
    hint: 'Log in on linkedin.com, copy li_at from DevTools (Application → Cookies), and paste here.'
  },
  reddit: {
    name: 'Reddit',
    icon: '🔴',
    color: '#ff4500',
    actionUrl: 'https://www.reddit.com/prefs/apps',
    actionText: '1. Open Reddit in Browser ↗',
    inputLabel: 'Reddit Token or Cookie',
    placeholder: 'Paste token_v2 or session cookie',
    hint: 'Log in on reddit.com, copy token_v2 from DevTools, and paste here.'
  }
}

function renderAuthPortal(source: AccountSource): string {
  const cfg = AUTH_CONFIG[source]
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Connect ${cfg.name} - Postly</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      background: #0e0e12;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: #18181c;
      border: 1px solid #27272a;
      padding: 36px 32px;
      border-radius: 20px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.7);
      max-width: 480px;
      width: 100%;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 20px;
    }
    .icon {
      font-size: 36px;
      background: #27272a;
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 4px;
      color: #ffffff;
    }
    p.sub {
      font-size: 13px;
      color: #a1a1aa;
      margin: 0;
      line-height: 1.4;
    }
    .action-btn {
      display: block;
      width: 100%;
      box-sizing: border-box;
      text-align: center;
      background: #27272a;
      color: #ffffff;
      padding: 12px 16px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      border: 1px solid #3f3f46;
      margin: 20px 0 16px;
      transition: all 0.2s ease;
    }
    .action-btn:hover {
      background: #3f3f46;
      border-color: #71717a;
    }
    label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #d4d4d8;
      margin-bottom: 6px;
    }
    input[type="text"], input[type="password"] {
      width: 100%;
      box-sizing: border-box;
      background: #121215;
      border: 1px solid #27272a;
      padding: 12px 14px;
      border-radius: 10px;
      color: #ffffff;
      font-family: monospace;
      font-size: 13px;
      outline: none;
      margin-bottom: 12px;
    }
    input:focus {
      border-color: #6366f1;
    }
    .hint {
      font-size: 12px;
      color: #71717a;
      line-height: 1.4;
      margin-bottom: 20px;
    }
    .submit-btn {
      width: 100%;
      background: #6366f1;
      color: #ffffff;
      border: none;
      padding: 13px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    .submit-btn:hover {
      background: #4f46e5;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">${cfg.icon}</div>
      <div>
        <h1>Connect ${cfg.name}</h1>
        <p class="sub">Authorize Postly to crawl live trends & topics</p>
      </div>
    </div>

    <a href="${cfg.actionUrl}" target="_blank" rel="noreferrer" class="action-btn">
      ${cfg.actionText}
    </a>

    <form method="POST" action="/callback">
      <input type="hidden" name="source" value="${source}">
      <label for="token">${cfg.inputLabel}</label>
      <input type="password" id="token" name="token" placeholder="${cfg.placeholder}" required autofocus>
      <p class="hint">${cfg.hint}</p>
      <button type="submit" class="submit-btn">2. Authorize & Connect to Postly →</button>
    </form>
  </div>
</body>
</html>`
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Postly - Connected Successfully</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      background: #0e0e12;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 16px;
      box-sizing: border-box;
    }
    .card {
      background: #18181c;
      border: 1px solid #27272a;
      padding: 44px 36px;
      border-radius: 20px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.7);
      text-align: center;
      max-width: 440px;
      width: 100%;
    }
    .icon-wrap {
      width: 68px;
      height: 68px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 34px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 10px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    p {
      color: #a1a1aa;
      font-size: 14px;
      margin: 0 0 24px;
      line-height: 1.6;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #10b981;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 9999px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">✓</div>
    <h1>Account Connected!</h1>
    <p>Authentication was successful (<strong>200 OK</strong>). You can now safely close this browser tab and return to <strong>Postly</strong>.</p>
    <div class="badge">HTTP 200 OK • CONNECTED</div>
  </div>
  <script>
    setTimeout(() => {
      try { window.close(); } catch(e) {}
    }, 3000);
  </script>
</body>
</html>`

let activeServer: http.Server | null = null

export interface OAuthResult {
  ok: boolean
  source?: AccountSource
  error?: string
}

function parseBody(req: http.IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      const params = new URLSearchParams(body)
      const data: Record<string, string> = {}
      for (const [k, v] of params.entries()) {
        data[k] = v
      }
      resolve(data)
    })
  })
}

/**
 * Starts local HTTP authorization server on port 4321, opens the browser
 * to the authentication portal, serves the 200 OK confirmation upon submission,
 * and saves credentials to encrypted safe storage.
 */
export function startOAuthFlow(source: AccountSource): Promise<OAuthResult> {
  return new Promise((resolve) => {
    if (activeServer) {
      try {
        activeServer.close()
      } catch {}
      activeServer = null
    }

    let finished = false

    const cleanup = () => {
      if (activeServer) {
        try {
          activeServer.close()
        } catch {}
        activeServer = null
      }
    }

    const finish = (result: OAuthResult) => {
      if (finished) return
      finished = true
      cleanup()
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'Authentication timeout' })
    }, 10 * 60 * 1000)

    activeServer = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${OAUTH_PORT}`)

        // Portal Page
        if (reqUrl.pathname === '/' || reqUrl.pathname === '/auth') {
          const reqSource = (reqUrl.searchParams.get('source') as AccountSource) || source
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderAuthPortal(reqSource))
          return
        }

        // Callback Submission
        if (reqUrl.pathname === '/callback') {
          let token = ''
          let accountSource = source

          if (req.method === 'POST') {
            const formData = await parseBody(req)
            token = (formData['token'] || '').trim()
            if (formData['source']) accountSource = formData['source'] as AccountSource
          } else {
            token = (
              reqUrl.searchParams.get('token') ||
              reqUrl.searchParams.get('code') ||
              reqUrl.searchParams.get('access_token') ||
              ''
            ).trim()
          }

          if (!token) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end('<h1>Error: No token provided</h1>')
            return
          }

          // Save credentials into encrypted settings
          const patch: Record<string, string> = {}
          if (accountSource === 'github') {
            const match = token.match(/user_session=([^;\s]+)/)
            patch['GITHUB_TOKEN'] = match ? match[1] : token
          } else if (accountSource === 'x') {
            const authMatch = token.match(/auth_token=([^;\s]+)/)
            const ct0Match = token.match(/ct0=([^;\s]+)/)
            if (authMatch) patch['X_AUTH_TOKEN'] = authMatch[1]
            if (ct0Match) patch['X_CT0'] = ct0Match[1]
            if (!authMatch && !ct0Match) {
              patch['X_AUTH_TOKEN'] = token
              patch['X_CT0'] = Math.random().toString(36).slice(2)
            }
          } else if (accountSource === 'linkedin') {
            const liMatch = token.match(/li_at=([^;\s]+)/)
            patch['LINKEDIN_LI_AT'] = liMatch ? liMatch[1] : token
          } else if (accountSource === 'reddit') {
            const tokenMatch = token.match(/token_v2=([^;\s]+)/) || token.match(/reddit_session=([^;\s]+)/)
            patch['REDDIT_COOKIE'] = tokenMatch ? tokenMatch[1] : token
          }

          setSettings(patch)
          invalidateAccountStatusCache()

          // Send 200 OK Success Page
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(SUCCESS_HTML)

          clearTimeout(timer)
          finish({ ok: true, source: accountSource })
          return
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Internal Server Error')
      }
    })

    activeServer.listen(OAUTH_PORT, '127.0.0.1', () => {
      const portalUrl = `http://127.0.0.1:${OAUTH_PORT}/auth?source=${source}`
      shell.openExternal(portalUrl)
    })

    activeServer.on('error', (err) => {
      clearTimeout(timer)
      finish({ ok: false, error: `Failed to start local server: ${err.message}` })
    })
  })
}
