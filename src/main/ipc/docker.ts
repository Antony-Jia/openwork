import { IpcMain, dialog } from "electron"
import { spawn } from "node:child_process"
import type { DockerConfig } from "../types"
import {
  enterDockerMode,
  exitDockerMode,
  getDockerConfig,
  getDockerRuntimeConfig,
  getDockerSessionStatus,
  restartDockerMode,
  setDockerConfig
} from "../docker/session"
import { loadDockerFiles } from "./models"

function runDockerCheck(timeoutMs = 8000): Promise<{ available: boolean; error?: string }> {
  return new Promise((resolve) => {
    console.log("[DockerIPC] Running docker version check...")
    const proc = spawn("docker", ["version"], { stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""
    let stdout = ""

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM")
      resolve({ available: false, error: "Docker check timed out." })
    }, timeoutMs)

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })
    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString()
    })

    proc.on("close", (code) => {
      clearTimeout(timeout)
      console.log("[DockerIPC] docker version exit:", code)
      if (code === 0) {
        console.log("[DockerIPC] docker version output:", stdout.trim())
        resolve({ available: true })
      } else {
        console.warn("[DockerIPC] docker version stderr:", stderr.trim())
        resolve({
          available: false,
          error: stderr.trim() || "Docker is not available."
        })
      }
    })

    proc.on("error", (err) => {
      clearTimeout(timeout)
      console.error("[DockerIPC] docker version spawn error:", err.message)
      resolve({ available: false, error: err.message })
    })
  })
}

export function registerDockerHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("docker:check", async () => {
    return runDockerCheck()
  })

  ipcMain.handle("docker:getConfig", async () => {
    return getDockerConfig()
  })

  ipcMain.handle("docker:setConfig", async (_event, config: DockerConfig) => {
    return setDockerConfig(config)
  })

  ipcMain.handle("docker:status", async () => {
    return getDockerSessionStatus()
  })

  ipcMain.handle("docker:enter", async () => {
    return enterDockerMode()
  })

  ipcMain.handle("docker:exit", async () => {
    return exitDockerMode()
  })

  ipcMain.handle("docker:restart", async () => {
    return restartDockerMode()
  })

  ipcMain.handle("docker:runtimeConfig", async () => {
    return getDockerRuntimeConfig()
  })

  ipcMain.handle("docker:selectMountPath", async (_event, currentPath?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Select Mount Folder",
      message: "Choose a folder to mount into the container",
      defaultPath: currentPath || undefined
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle("docker:mountFiles", async () => {
    const config = getDockerConfig()
    try {
      const mounts = config.mounts || []
      const files = await loadDockerFiles(mounts)
      return {
        success: true,
        files,
        mounts
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        files: []
      }
    }
  })
}
