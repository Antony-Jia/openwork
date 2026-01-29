import { IpcMain } from "electron"
import { getSettings, updateSettings } from "../settings"
import { updateEmailPollingInterval } from "../email/worker"
import type { SettingsUpdateParams } from "../types"

export function registerSettingsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("settings:get", async () => {
    return getSettings()
  })

  ipcMain.handle("settings:update", async (_event, payload: SettingsUpdateParams) => {
    const next = updateSettings(payload.updates)
    updateEmailPollingInterval(next.email?.pollIntervalSec)
    return next
  })
}
