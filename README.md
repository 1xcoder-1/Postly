# Postly

Free desktop app (Electron + React + TS + Vite) that helps you create and manage
daily social posts about AI, developer tools and tech news.

## Stack
- **Desktop/UI:** Electron + React + TypeScript + Vite (via electron-vite)
- **Styling:** Tailwind CSS + shadcn/ui primitives
- **State:** Zustand
- **DB:** Neon (free Postgres) + Drizzle ORM — with a local JSON fallback so the
  app runs before you connect Neon
- **AI (multi-model, auto-fallback):**
  - Text: Groq → Gemini → OpenRouter → Cloudflare → Pollinations (no key)
  - Images: Gemini (primary, high quality) → Cloudflare → Hugging Face →
    Pollinations (no key). Chosen **image style** drives the prompt (see below).
  - Per-model daily free-tier caps + consecutive-failure cooldown (persisted to
    disk), request timeouts, response validation, Professional/Casual/Bold tones,
    and the option to force a specific model. The Dashboard shows live usage.
- **Image styles (single IG + carousel):** a ChatGPT-style picker offers 9 curated
  presets — editorial-photo, cinematic, documentary, product-natural, film-portrait
  (photographic) and swiss-poster, riso-print, flat-vector, muted-brand (graphic).
  Each preset injects realism cues (real textures, natural light, restrained palette)
  plus anti-"AI-slop" negative cues (no neon gradients, no oversaturation, no plastic
  CGI). Images are generated **text-free** (no baked-in headline — models garble text,
  the #1 AI giveaway); captions carry the words. Carousel posts get **one styled image
  per slide** (4:5 portrait, generated with bounded concurrency); failures are
  non-fatal and that slide falls back to a text card. True 4K is provider-capped —
  we request the highest native resolution at the correct aspect (~1080×1350).
- **Crawlers:** Python scripts invoked from Electron via `child_process`
  (spawned with an argv array — never `shell: true`, each with a hard timeout;
  output is validated + sanitized before it reaches the renderer)
  - Hacker News (free Algolia API), Reddit (PRAW), daily.dev, V2EX, and
    [Agent Reach](https://github.com/Panniantong/agent-reach) — its `doctor`
    installs/configures the upstream tools (yt-dlp, Jina Reader, feedparser),
    which the crawlers then call directly; the Dashboard shows live `doctor` health.
  - **Reference-driven, never hard-coded.** `backend/crawlers/references.json`
    (seeded from your `reference.md`) lists the YouTube videos/channels,
    Instagram profiles/posts and LinkedIn links to scrape. Change the file or set
    env (`YT_REFS`/`YT_CHANNELS`, `IG_PROFILES`/`IG_EXPORT_FILES`, `LINKEDIN_REFS`)
    to retarget any source — the content itself is always scraped live.
    - `youtube_crawler.py` uses yt-dlp to pull each reference channel's live
      uploads (the old YouTube Atom feed now 404s).
    - `linkedin_crawler.py` mirrors any public link to topics via Jina Reader.
    - `instagram_crawler.py` reads reference profiles (opt-in, rate-limited) or
      ingests a posts export you point at with `IG_EXPORT_FILES`.
  - **English-only by default.** A shared filter (`lang.py` + `crawlerService.ts`)
    drops non-Latin-script and romanized-Hinglish titles from every source
    (`ENGLISH_ONLY=0` disables). Instagram additionally auto-enables when
    `agent-reach doctor` reports the channel active — capability-driven.
  - Optional, opt-in via env: X/Twitter (`twscrape`), general web deep-scraping
    (`crawl4ai`). Each returns `[]` when its package or env config is absent.
  - `getDailyTopics()` combines all enabled sources, dedupes, filters and ranks
    by **relevance + engagement**, cached ~45 min — but the UI's **New topics**
    button passes `refresh:true` to re-crawl live on every click.

## Setup
```bash
npm install
cp .env.example .env      # optional; keys can also be set from the Settings page
pip install -r backend/crawlers/requirements.txt   # optional (only Reddit needs praw)

# optional but recommended: Agent Reach crawler channels (free, no cookies)
pip install "https://github.com/Panniantong/agent-reach/archive/main.zip" yt-dlp
agent-reach install --env=auto            # read-only check of what's missing
agent-reach install --env=auto --system   # after you approve system changes
npm run dev               # launch the app
```

## Scripts
| command | does |
|---|---|
| `npm run dev` | start Electron + Vite dev server |
| `npm run build` | build main/preload/renderer into `out/` |
| `npm run typecheck` | type-check node + web configs |
| `npm run db:generate` | generate Drizzle SQL migration from schema |
| `npm run db:push` | push schema to the Neon DB (needs `DATABASE_URL`) |
| `npm run dist` | build + package for the current OS (Win/mac/Linux) |
| `npm run dist:win` | build + package Windows (NSIS installer + portable) |
| `npm run dist:mac` | build + package macOS (dmg + zip) |
| `npm run dist:linux` | build + package Linux (AppImage + deb) |

## Packaging (electron-builder)
Config lives in [`electron-builder.yml`](electron-builder.yml). It ships:
- the compiled `out/` bundle inside an asar,
- the Python `backend/crawlers` + `build/icon.png` as loose `extraResources`
  (read from `process.resourcesPath` at runtime — see `backend/paths.ts`),
- installers/artifacts into `release/` (`npm run dist:win|mac|linux`).

Data is written to **OS userData** when packaged (posts/settings/keys/usage), and
to `./data` in dev — so nothing is ever written into the read-only install dir.
Build installers on the matching host OS (mac from macOS, etc.); cross-building
`.icns`/`.ico` is handled by electron-builder from `build/icon.png`.

## How it fits together
```
backend/
  ai/       multi-model router:
            - textProviders / imageProviders: each model declares label, envKey,
              dailyCap; add a model by dropping one into the array
            - textChain / imageChain: walk the list in priority order, skip
              providers missing keys or that are over-cap / cooling down,
              fall through on quota/timeout/error, optionally force one model
            - usage.ts: persistent per-day usage + consecutive-failure cooldown
              in ./data/ai-usage.json (survives restarts), feeds the Dashboard
              status panel and the recent-attempts log
            - httpTimeout.ts: AbortController deadline on every request;
              validation.ts: responses checked before use (empty/rate-limit text,
              malformed images are rejected and fall through)
            - errors.ts: QuotaError / TimeoutError classification;
              prompts.ts: 3 styles × Professional/Casual/Bold tone
  db/       Drizzle schema — posts (content, image_urls, posted_at,
            rejection_reason, is_deleted soft-delete, indexes on status/
            created_at/scheduled_at), rejection_feedback (post_id FK, reason,
            notes), settings (key/value app prefs) + postStore/settingsRepo
            (Postgres when DATABASE_URL set, else ./data/*.json) + client.ts
            health check
  services/ generateService (content), crawlerService (child_process),
            settingsService (safeStorage-encrypted API keys),
            envValidation (startup checks)
  crawlers/ hn_crawler.py, reddit_crawler.py, dailydev_crawler.py,
            youtube_crawler.py (yt-dlp, reference-driven), linkedin_crawler.py
            (Jina Reader), instagram_crawler.py (profiles/export), x_crawler.py,
            web_crawler.py (crawl4ai), agent_reach_crawler.py (doctor status +
            RSS/V2EX/HN topics), lang.py (English filter), references.json (seeds)
src/
  main/     Electron window + IPC handlers
  preload/  contextBridge (window.postly.invoke)
  renderer/ React pages: Dashboard, Generate Post, Drafts, Settings
```

**AI learns from rejections:** rejecting a post in Drafts stores a row in
`rejection_feedback`; the next generation for that topic injects those as
negative examples into the prompt.

**Daily usage tracking:** every provider attempt is recorded per-day in
`./data/ai-usage.json` — call counts, consecutive failures (a model that fails
3× in a row cools down for the rest of the day), and a rolling recent-attempts
log. Because it is file-backed, caps and cooldowns survive app restarts. The
Dashboard's "AI models · daily usage" panel reads this so you can see which
model is available and which one answered the last generation.

Tune it without touching code via env vars in `.env`:
`AI_TEXT_TIMEOUT_MS`, `AI_IMAGE_TIMEOUT_MS`, and per-model caps like
`AI_DAILY_GROQ`, `AI_DAILY_GEMINI`, `AI_DAILY_POLLINATIONS_IMAGE`.

## Security
- **Context isolation ON, node integration OFF, no remote module.** The renderer
  only reaches the system through the `window.postly` preload bridge (`ipcRenderer.invoke`).
- **Secrets never enter the renderer.** API keys are held in the **main** process
  only; `settings:get` returns just `{ configured, length }` — never key text.
- **Encrypted at rest.** Keys persist via Electron `safeStorage`
  (Windows DPAPI / macOS Keychain / Linux libsecret) to `data/settings.enc`.
  If the OS reports encryption is unavailable, keys are kept in memory for the
  session only and are **never written to disk in plaintext** (use `.env` instead).
- **Environment validated on startup.** `envValidation.ts` flags malformed or
  half-configured keys (wrong prefix, Cloudflare/Reddit pairing) in the main
  console — without ever logging the secret values.
- **CSP.** A dev-tolerant `<meta>` CSP ships in `index.html`; production adds a
  stricter `script-src 'self'` response header (no inline scripts). The renderer
  makes **no direct network calls** (everything is IPC), so `connect-src` stays tight.
- **Navigation locked.** External links open in the system browser **only** to the
  official platform domains (an allow-list in `src/main/ipc.ts` `shell:open`);
  top-level navigation away from the app's own content is blocked.
- **No platform passwords.** Posting is manual (copy caption + open the official
  page); we never store credentials or auto-publish.
- **Writable data in userData.** Packaged builds keep posts/keys/usage under the
  OS user-data dir, never inside the read-only install location.

> No analytics feature by design.

## Polish & extras
- **About page** (`/about`) — version, stack, privacy summary, shortcuts, updates.
- **Keyboard shortcuts** — press `?` anywhere, or the top-bar "Shortcuts" button.
  Also `Ctrl/⌘+S` (save draft) and `Ctrl/⌘+Enter` (mark ready) on Generate.
- **Auto-update placeholder** — `backend/services/updater.ts` + a "Check for
  updates" button. It makes **no network calls**; wire `electron-updater` into
  `checkForUpdates()` later without touching the IPC channel or UI.
- **Error handling everywhere** — every async action surfaces a toast; a
  render-level `ErrorBoundary`, global `window error`/`unhandledrejection`
  listeners, and store-load `ErrorBanner` (with Retry) cover the rest.

## Pre-release checklist
- [x] `npm run typecheck` and `npm run build` pass
- [x] Migrations present in `drizzle/` (0000 + 0001 publication column)
- [x] App icon (`build/icon.png`) + window/dock title "Postly"
- [x] Loading, empty and error states on every page
- [x] Packaging config + `dist:win|mac|linux` scripts
- [x] Security reviewed: context isolation, CSP, safeStorage keys (last-4 only),
      allow-listed external opens, no passwords stored, no analytics
- [ ] Optional: code-signing identities (Win cert / macOS notarization) for
      public distribution — installs show a SmartScreen/Gatekeeper prompt until then
- [ ] Optional: a real `electron-updater` release feed for auto-update
