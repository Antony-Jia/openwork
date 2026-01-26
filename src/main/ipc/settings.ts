import { IpcMain } from "electron"
import { getSettings, updateSettings } from "../settings"
import type { SettingsUpdateParams } from "../types"

export function registerSettingsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("settings:get", async () => {
    return getSettings()
  })

  ipcMain.handle("settings:update", async (_event, payload: SettingsUpdateParams) => {
    return updateSettings(payload.updates)
  })
}
