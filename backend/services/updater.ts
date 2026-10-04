export interface UpdateCheckResult {
  status: 'not-configured'
  message: string
}

// Placeholder for future auto-update support. Intentionally performs NO network
// requests and collects no telemetry. When a real release feed is wired up
// (e.g. GitHub Releases via electron-updater), replace the body of
// checkForUpdates() — the IPC channel, api method and UI button already exist.
export function checkForUpdates(): UpdateCheckResult {
  return {
    status: 'not-configured',
    message: 'Auto-update is not configured for this build. Grab new releases manually.'
  }
}
