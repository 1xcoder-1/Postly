import React from 'react'
import ReactDOM from 'react-dom/client'
import { toast } from 'sonner'
import App from './App'
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
