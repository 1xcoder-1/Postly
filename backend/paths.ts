import { app } from 'electron'
import { resolve } from 'node:path'

// Central path resolution so the same code works in `npm run dev` (repo cwd)
// and in a packaged install, where the app directory is read-only.
//   - data dir   → userData when packaged, repo ./data in dev
//   - crawlers   → bundled resources when packaged, repo path in dev
export const DATA_DIR = resolve(app.isPackaged ? app.getPath('userData') : process.cwd(), 'data')

export const CRAWLERS_DIR = app.isPackaged
  ? resolve(process.resourcesPath, 'backend', 'crawlers')
  : resolve(process.cwd(), 'backend', 'crawlers')
