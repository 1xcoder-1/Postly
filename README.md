# Scout

Free desktop app (Electron + React + TS + Vite) that crawls live AI / dev-tool /
tech topics and helps you **write and schedule your own posts**. It never connects
to a social account and never posts anywhere. The only AI it uses is Gemini, and
only to describe — as text — what image would suit a topic and to hand you
copy-ready prompts. You write everything yourself.

## Product flow
Crawlers fetch live topics from platforms → **Topic Radar** shows them as grouped
source cards → click a group, then a topic → the detail dialog shows cross-platform
coverage plus a **Gemini image brief** (visual advice + prompts) → you write the
post **manually** in **Write Post** → save it as a draft with an optional schedule
date → the **Calendar** shows scheduled items live. Nothing publishes; "Mark done"
is just your own bookkeeping.

## Stack
- **Desktop/UI:** Electron + React + TypeScript + Vite (via electron-vite)
- **Styling:** Tailwind CSS + shadcn/ui primitives
- **State:** Zustand
- **DB:** Neon (free Postgres) + Drizzle ORM — with a local JSON fallback so the
  app runs before you connect Neon. Rows are scoped to a per-device id; **no login**.
- **AI (Gemini only, text):** `backend/ai/gemini.ts` calls
  `gemini-2.5-flash:generateContent` with a single prompt builder in
  `prompts.ts`. Given a topic it returns `{ visualDescription, prompts[] }` —
  advice on the visual + copy-ready image-generation prompts. **No content or
  images are generated.** The key comes from `.env` (`GEMINI_API_KEY`) only.
- **Crawlers:** Python scripts invoked from Electron via `child_process`
  (spawned with an argv array — never `shell: true`, each with a hard timeout;
  output is validated + sanitized before it reaches the renderer)
  - Hacker News (free Algolia API), Reddit (PRAW), dev.to, V2EX, and
    [Agent Reach](https://github.com/Panniantong/agent-reach) — its `doctor`
    installs/configures the upstream tools (yt-dlp, Jina Reader, feedparser),
    which the crawlers then call directly.
  - **Reference-driven, never hard-coded.** `backend/crawlers/references.json`
    lists the YouTube videos/channels, Instagram profiles/posts and LinkedIn links
    to scrape. Change the file or set env (`YT_REFS`/`YT_CHANNELS`,
    `IG_PROFILES`/`IG_EXPORT_FILES`, `LINKEDIN_REFS`) to retarget any source — the
    content itself is always scraped live.
  - **English-only by default.** A shared filter (`lang.py` + `crawlerService.ts`)
    drops non-Latin-script and romanized-Hinglish titles from every source
    (`ENGLISH_ONLY=0` disables).
  - Optional, opt-in via env: X/Twitter (`twscrape`), general web deep-scraping
    (`crawl4ai`). Each returns `[]` when its package or env config is absent.
  - `getDailyTopics()` combines all enabled sources, dedupes, filters and ranks
    by **relevance + engagement**, cached ~45 min — but the UI's **Refresh All
    Topics** button passes `refresh:true` to re-crawl live on every click.

## Setup
```bash
npm install
cp .env.example .env      # optional; GEMINI_API_KEY enables the image brief
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

Data is written to **OS userData** when packaged (posts + a read-only mirror of
stored env), and to `./data` in dev — so nothing is ever written into the
read-only install dir.

## How it fits together
```
backend/
  ai/       gemini.ts (single text call + image-brief parser),
            prompts.ts (buildImageBriefPrompt / parseImageBrief),
            httpTimeout.ts (AbortController deadline on every request),
            errors.ts (HTTP error classification)
  db/       Drizzle schema — posts (content, image_urls, posted_at, is_deleted
            soft-delete, indexes on status/created_at/scheduled_at) + postStore
            (Postgres when DATABASE_URL set, else ./data/*.json) + client.ts
  services/ crawlerService (child_process), auth.ts (per-device id scoping),
            settingsService (read-only mirror of stored env), scheduler.ts
            (local reminder pass: due scheduled → ready, never publishes),
            envValidation (startup checks)
  crawlers/ hn_crawler.py, reddit_crawler.py, dailydev_crawler.py,
            youtube_crawler.py (yt-dlp, reference-driven), linkedin_crawler.py
            (Jina Reader), instagram_crawler.py (profiles/export), x_crawler.py,
            web_crawler.py (crawl4ai), agent_reach_crawler.py (doctor status +
            RSS/V2EX/HN topics), lang.py (English filter), references.json (seeds)
src/
  main/     Electron window + IPC handlers
  preload/  contextBridge (window.postly.invoke)
  renderer/ React pages: Dashboard, Topic Radar, Write Post, Drafts, Calendar
```

## Security
- **Context isolation ON, node integration OFF, no remote module.** The renderer
  only reaches the system through the `window.postly` preload bridge (`ipcRenderer.invoke`).
- **Secrets never enter the renderer.** The Gemini key is read from `.env` in the
  **main** process only.
- **Environment validated on startup.** `envValidation.ts` flags malformed keys in
  the main console — without ever logging the secret values.
- **CSP.** A dev-tolerant `<meta>` CSP ships in `index.html`; production adds a
  stricter `script-src 'self'` response header (no inline scripts). The renderer
  makes **no direct network calls** (everything is IPC), so `connect-src` stays tight.
- **Navigation locked.** External links open in the system browser **only** over
  http(s) (validated in `src/main/ipc.ts` `shell:open`); the app never posts.
- **No platform passwords, no auto-publish.** Writing, scheduling and "Mark done"
  are entirely manual.
- **Writable data in userData.** Packaged builds keep posts under the OS user-data
  dir, never inside the read-only install location.

> No analytics feature by design.

## Polish & extras
- **Keyboard shortcuts** — press `?` anywhere, or the top-bar "Shortcuts" button.
  `Ctrl/⌘+S` saves the working post as a draft.
- **Error handling everywhere** — every async action surfaces a toast; a
  render-level `ErrorBoundary`, global `window error`/`unhandledrejection`
  listeners, and store-load `ErrorBanner` (with Retry) cover the rest.

## Pre-release checklist
- [x] `npm run typecheck` and `npm run build` pass
- [x] Migrations present in `drizzle/` (unused columns are simply no longer written)
- [x] App icon (`build/icon.png`) + window/dock title "Scout"
- [x] Loading, empty and error states on every page
- [x] Packaging config + `dist:win|mac|linux` scripts
- [x] Security reviewed: context isolation, CSP, allow-listed external opens,
      no passwords stored, no auto-publish, no analytics
