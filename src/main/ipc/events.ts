import { BrowserWindow } from "electron"

export function broadcastThreadsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("threads:changed")
  }
}

export function broadcastThreadHistoryUpdated(threadId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("thread:history-updated", threadId)
  }
}
