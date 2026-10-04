import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  main: {
    resolve: {
      alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) }
    }
  },
  preload: {
    resolve: {
      alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/shared', import.meta.url))
      }
    },
    plugins: [react()]
  }
})
