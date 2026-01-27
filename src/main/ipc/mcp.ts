import { IpcMain } from "electron"
import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  listRunningMcpTools,
  startMcpServer,
  stopMcpServer,
  updateMcpServer
} from "../mcp/service"
import type { McpServerCreateParams, McpServerUpdateParams } from "../types"
import { logEntry, logExit, withSpan } from "../logging"

export function registerMcpHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("mcp:list", async () => {
    return withSpan("IPC", "mcp:list", undefined, async () => listMcpServers())
  })

  ipcMain.handle("mcp:tools", async () => {
    return withSpan("IPC", "mcp:tools", undefined, async () => listRunningMcpTools())
  })

  ipcMain.handle("mcp:create", async (_event, payload: McpServerCreateParams) => {
    return withSpan("IPC", "mcp:create", { name: payload.name, mode: payload.mode }, async () =>
      createMcpServer(payload)
    )
  })

  ipcMain.handle("mcp:update", async (_event, payload: McpServerUpdateParams) => {
    return withSpan(
      "IPC",
      "mcp:update",
      { id: payload.id, updates: Object.keys(payload.updates || {}) },
      async () => updateMcpServer(payload)
    )
  })

  ipcMain.handle("mcp:delete", async (_event, id: string) => {
    logEntry("IPC", "mcp:delete", { id })
    const result = await deleteMcpServer(id)
    logExit("IPC", "mcp:delete", { id })
    return result
  })

  ipcMain.handle("mcp:start", async (_event, id: string) => {
    return withSpan("IPC", "mcp:start", { id }, async () => startMcpServer(id))
  })

  ipcMain.handle("mcp:stop", async (_event, id: string) => {
    return withSpan("IPC", "mcp:stop", { id }, async () => stopMcpServer(id))
  })
}
