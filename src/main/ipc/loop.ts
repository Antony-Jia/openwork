import { IpcMain } from "electron"
import { loopManager } from "../loop/manager"
import type { LoopConfig } from "../types"

export function registerLoopHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("loop:getConfig", async (_event, threadId: string) => {
    return loopManager.getConfig(threadId)
  })

  ipcMain.handle(
    "loop:updateConfig",
    async (_event, { threadId, config }: { threadId: string; config: LoopConfig }) => {
      return loopManager.updateConfig(threadId, config)
    }
  )

  ipcMain.handle("loop:start", async (_event, threadId: string) => {
    return loopManager.start(threadId)
  })

  ipcMain.handle("loop:stop", async (_event, threadId: string) => {
    return loopManager.stop(threadId)
  })

  ipcMain.handle("loop:status", async (_event, threadId: string) => {
    return loopManager.getStatus(threadId)
  })
}
