import React from 'react'
import ReactDOM from 'react-dom/client'
import { toast } from 'sonner'
import App from './App'
// MasterJi font stack (bundled so the app works fully offline)
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/600.css'
import '@fontsource/palanquin/500.css'
import '@fontsource/palanquin/600.css'
import '@fontsource/palanquin/700.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import './globals.css'

// Last-resort safety net: any error or rejected promise that escapes a
// component's own try/catch is surfaced to the user instead of failing silently.
window.addEventListener('error', (e) => {
  if (e.message) toast.error(e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  toast.error(e.reason instanceof Error ? e.reason.message : 'Something went wrong')
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
