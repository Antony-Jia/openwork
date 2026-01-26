import { IpcMain } from "electron"
import { middlewareDefinitions } from "../middleware/registry"

export function registerMiddlewareHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("middleware:list", async () => {
    return middlewareDefinitions
  })
}
