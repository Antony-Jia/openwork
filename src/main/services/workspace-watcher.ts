import * as fs from "fs"
import * as path from "path"
import { BrowserWindow } from "electron"

// Store active watchers by thread ID
const activeWatchers = new Map<string, fs.FSWatcher[]>()

// Debounce timers to prevent rapid-fire updates
const debounceTimers = new Map<string, NodeJS.Timeout>()

const DEBOUNCE_DELAY = 500 // ms

/**
 * Start watching a workspace directory for file changes.
 * Sends 'workspace:files-changed' events to the renderer when changes are detected.
 */
export function startWatching(threadId: string, workspacePath: string): void {
  startWatchingPaths(threadId, [workspacePath])
}

export function startWatchingPaths(threadId: string, workspacePaths: string[]): void {
  stopWatching(threadId)

  const watchers: fs.FSWatcher[] = []
  for (const workspacePath of workspacePaths) {
    if (!workspacePath) continue

    try {
      const stat = fs.statSync(workspacePath)
      if (!stat.isDirectory()) {
        console.warn(`[WorkspaceWatcher] Path is not a directory: ${workspacePath}`)
        continue
      }
    } catch (e) {
      console.warn(`[WorkspaceWatcher] Cannot access path: ${workspacePath}`, e)
      continue
    }

    try {
      const watcher = fs.watch(workspacePath, { recursive: true }, (eventType, filename) => {
        if (filename) {
          const parts = filename.split(path.sep)
          if (parts.some((p) => p.startsWith(".") || p === "node_modules")) {
            return
          }
        }

        console.log(`[WorkspaceWatcher] ${eventType}: ${filename} in thread ${threadId}`)

        const existingTimer = debounceTimers.get(threadId)
        if (existingTimer) {
          clearTimeout(existingTimer)
        }

        const timer = setTimeout(() => {
          debounceTimers.delete(threadId)
          notifyRenderer(threadId, workspacePath)
        }, DEBOUNCE_DELAY)

        debounceTimers.set(threadId, timer)
      })

      watcher.on("error", (error) => {
        console.error(`[WorkspaceWatcher] Error watching ${workspacePath}:`, error)
        stopWatching(threadId)
      })

      watchers.push(watcher)
      console.log(`[WorkspaceWatcher] Started watching ${workspacePath} for thread ${threadId}`)
    } catch (e) {
      console.error(`[WorkspaceWatcher] Failed to start watching ${workspacePath}:`, e)
    }
  }

  if (watchers.length > 0) {
    activeWatchers.set(threadId, watchers)
  }
}

/**
 * Stop watching the workspace for a specific thread.
 */
export function stopWatching(threadId: string): void {
  const watchers = activeWatchers.get(threadId)
  if (watchers) {
    watchers.forEach((watcher) => watcher.close())
    activeWatchers.delete(threadId)
    console.log(`[WorkspaceWatcher] Stopped watching for thread ${threadId}`)
  }

  const timer = debounceTimers.get(threadId)
  if (timer) {
    clearTimeout(timer)
    debounceTimers.delete(threadId)
  }
}

/**
 * Stop all active watchers.
 */
export function stopAllWatching(): void {
  for (const threadId of activeWatchers.keys()) {
    stopWatching(threadId)
  }
}

/**
 * Notify renderer windows about file changes.
 */
function notifyRenderer(threadId: string, workspacePath: string): void {
  const windows = BrowserWindow.getAllWindows()

  for (const win of windows) {
    win.webContents.send("workspace:files-changed", {
      threadId,
      workspacePath
    })
  }
}

/**
 * Check if a thread's workspace is currently being watched.
 */
export function isWatching(threadId: string): boolean {
  return activeWatchers.has(threadId)
}
