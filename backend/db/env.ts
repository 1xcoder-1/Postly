// Loads .env into process.env for the Electron main process.
// Import this module before anything that reads environment variables.
import { config as loadDotenv } from 'dotenv'
import { resolve } from 'node:path'

loadDotenv({ path: resolve(process.cwd(), '.env') })
