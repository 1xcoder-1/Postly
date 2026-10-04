// Renderer-side view of the preload bridge (exposed as window.postly).
interface PostlyBridge {
  invoke: (channel: string, payload?: unknown) => Promise<{ ok: boolean; data?: unknown; error?: string }>
  on: (event: 'scheduler:tick', cb: (data: unknown) => void) => () => void
}

declare global {
  interface Window {
    postly: PostlyBridge
  }
}

export {}
