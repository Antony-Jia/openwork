import { app, shell, BrowserWindow, ipcMain, nativeImage } from "electron"
import { join } from "path"
import { registerAgentHandlers } from "./ipc/agent"
import { broadcastToast } from "./ipc/events"

// Prevent Windows error dialog boxes for unhandled errors
process.on("uncaughtException", (error) => {
  console.error("[Main] Uncaught exception:", error)
  const message = error instanceof Error ? error.message : String(error)
  broadcastToast("error", `Uncaught error: ${message}`)
})

process.on("unhandledRejection", (reason) => {
  console.error("[Main] Unhandled rejection:", reason)
  const message = reason instanceof Error ? reason.message : String(reason)
  broadcastToast("error", `Unhandled error: ${message}`)
})
import { registerThreadHandlers } from "./ipc/threads"
import { registerModelHandlers } from "./ipc/models"
import { registerSubagentHandlers } from "./ipc/subagents"
import { registerSkillHandlers } from "./ipc/skills"
import { registerToolHandlers } from "./ipc/tools"
import { registerMiddlewareHandlers } from "./ipc/middleware"
import { registerDockerHandlers } from "./ipc/docker"
import { initializeDatabase } from "./db"
import { registerMcpHandlers } from "./ipc/mcp"
import { startAutoMcpServers } from "./mcp/service"
import { registerSettingsHandlers } from "./ipc/settings"
import { startEmailPolling, stopEmailPolling } from "./email/worker"

let mainWindow: BrowserWindow | null = null

// Simple dev check - replaces @electron-toolkit/utils is.dev
const isDev = !app.isPackaged

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    frame: false, // Frameless mode
    backgroundColor: "#0D0D0F",
    // titleBarStyle: "hiddenInset", // Removed for custom controls
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  })

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show()
    // Auto-open devtools to debug issues
    if (mainWindow) {
      mainWindow.webContents.openDevTools()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: "deny" }
  })

  // IPC Handlers for Window Controls
  ipcMain.on("window-minimize", () => {
    mainWindow?.minimize()
  })

  ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow?.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on("window-close", () => {
    mainWindow?.close()
  })

  // HMR for renderer based on electron-vite cli
  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"])
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Set app user model id for windows
  if (process.platform === "win32") {
    app.setAppUserModelId(isDev ? process.execPath : "com.langchain.openwork")
  }

  // Set dock icon on macOS
  if (process.platform === "darwin" && app.dock) {
    const iconPath = join(__dirname, "../../resources/icon.png")
    try {
      const icon = nativeImage.createFromPath(iconPath)
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon)
      }
    } catch {
      // Icon not found, use default
    }
  }

  // Default open or close DevTools by F12 in development
  if (isDev) {
    app.on("browser-window-created", (_, window) => {
      window.webContents.on("before-input-event", (event, input) => {
        if (input.key === "F12") {
          window.webContents.toggleDevTools()
          event.preventDefault()
        }
      })
    })
  }

  // Initialize database
  await initializeDatabase()

  // Register IPC handlers
  registerAgentHandlers(ipcMain)
  registerThreadHandlers(ipcMain)
  registerModelHandlers(ipcMain)
  registerSubagentHandlers(ipcMain)
  registerSkillHandlers(ipcMain)
  registerToolHandlers(ipcMain)
  registerMiddlewareHandlers(ipcMain)
  registerDockerHandlers(ipcMain)
  registerMcpHandlers(ipcMain)
  registerSettingsHandlers(ipcMain)

  await startAutoMcpServers()

  createWindow()

  startEmailPolling()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("before-quit", () => {
  stopEmailPolling()
})
