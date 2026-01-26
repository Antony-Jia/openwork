import { IpcMain } from "electron"
import { listTools, updateToolEnabled, updateToolKey } from "../tools/service"
import type { ToolEnableUpdateParams, ToolKeyUpdateParams } from "../types"

export function registerToolHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("tools:list", async () => {
    return listTools()
  })

  ipcMain.handle("tools:setKey", async (_event, payload: ToolKeyUpdateParams) => {
    return updateToolKey(payload.name, payload.key)
  })

  ipcMain.handle("tools:setEnabled", async (_event, payload: ToolEnableUpdateParams) => {
    return updateToolEnabled(payload.name, payload.enabled)
  })
}
