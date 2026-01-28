import { BrowserWindow } from "electron"

export function broadcastThreadsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("threads:changed")
  }
}
