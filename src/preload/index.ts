import { contextBridge, ipcRenderer } from 'electron'

// Events the renderer is allowed to subscribe to. A strict allow-list keeps the
// bridge from becoming a generic channel to listen on anything main might send.
const ALLOWED_EVENTS = ['scheduler:tick'] as const
export type BridgeEvent = (typeof ALLOWED_EVENTS)[number]

// A single generic invoke keeps the bridge small; the renderer wraps it in a
// typed API (src/renderer/lib/api.ts).
const api = {
  invoke: (channel: string, payload?: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> =>
    ipcRenderer.invoke(channel, payload),
  // Subscribe to a main→renderer push event. Returns an unsubscribe function.
  on: (event: BridgeEvent, cb: (data: unknown) => void): (() => void) => {
    if (!ALLOWED_EVENTS.includes(event)) return () => {}
    const listener = (_e: Electron.IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  }
}

contextBridge.exposeInMainWorld('postly', api)

export type PostlyBridge = typeof api
