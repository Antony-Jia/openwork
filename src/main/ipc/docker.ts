import { IpcMain } from "electron"
import { spawn } from "node:child_process"

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
}
