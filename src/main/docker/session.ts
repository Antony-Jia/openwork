import { spawn } from "node:child_process"
import type { DockerConfig, DockerSessionStatus } from "../types"
import { getSettings, updateSettings } from "../settings"

const DEFAULT_CONFIG: DockerConfig = {
  enabled: false,
  image: "python:3.13-alpine",
  mounts: [
    {
      hostPath: "",
      containerPath: "/workspace",
      readOnly: false
    }
  ],
  resources: {},
  ports: []
}

const SESSION_CONTAINER_NAME = "openwork-session"

let sessionEnabled = false
let containerId: string | null = null
let containerName: string | null = null
let lastError: string | null = null

function sanitizeConfig(config: DockerConfig): DockerConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    enabled: false,
    mounts: config.mounts?.length ? config.mounts : DEFAULT_CONFIG.mounts,
    resources: config.resources || {},
    ports: config.ports || []
  }
}

export function getDockerConfig(): DockerConfig {
  const settings = getSettings()
  if (settings.dockerConfig) {
    return sanitizeConfig(settings.dockerConfig as DockerConfig)
  }
  return DEFAULT_CONFIG
}

export function setDockerConfig(config: DockerConfig): DockerConfig {
  const next = sanitizeConfig(config)
  updateSettings({ dockerConfig: next })
  return next
}

export function isDockerModeEnabled(): boolean {
  return sessionEnabled
}

export function getDockerSessionStatus(): DockerSessionStatus {
  return {
    enabled: sessionEnabled,
    running: !!containerId,
    containerId: containerId || undefined,
    containerName: containerName || undefined,
    error: lastError || undefined
  }
}

async function runDockerCommand(
  args: string[],
  timeoutMs = 120_000
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let resolved = false

    const timeout = setTimeout(() => {
      if (resolved) return
      resolved = true
      proc.kill("SIGTERM")
      resolve({ stdout: "", stderr: "Docker command timed out.", exitCode: null })
    }, timeoutMs)

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString()
    })
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on("close", (code) => {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      resolve({ stdout, stderr, exitCode: code })
    })

    proc.on("error", (err) => {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      resolve({ stdout: "", stderr: err.message, exitCode: 1 })
    })
  })
}

function buildDockerRunArgs(config: DockerConfig, name: string): string[] {
  const args: string[] = ["run", "-d", "--name", name]
  const mounts = config.mounts || []

  for (const mount of mounts) {
    if (!mount.hostPath || !mount.containerPath) continue
    const normalized = mount.containerPath.replace(/\\/g, "/")
    const containerPath = normalized.startsWith("/") ? normalized : `/${normalized}`
    const mountArg = `${mount.hostPath}:${containerPath}${mount.readOnly ? ":ro" : ""}`
    args.push("-v", mountArg)
  }

  const resources = config.resources || {}
  if (resources.cpu) {
    args.push("--cpus", String(resources.cpu))
  }
  if (resources.memoryMb) {
    args.push("--memory", `${resources.memoryMb}m`)
  }

  for (const port of config.ports || []) {
    if (!port.host || !port.container) continue
    const protocol = port.protocol || "tcp"
    args.push("-p", `${port.host}:${port.container}/${protocol}`)
  }

  return args
}

async function removeContainer(name: string): Promise<void> {
  await runDockerCommand(["rm", "-f", name], 30_000)
}

async function startContainer(config: DockerConfig): Promise<{ id: string }> {
  const name = SESSION_CONTAINER_NAME
  await removeContainer(name)

  const args = buildDockerRunArgs(config, name)
  args.push(config.image, "sh", "-c", "tail -f /dev/null")
  const result = await runDockerCommand(args, 120_000)

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error(result.stderr || "Failed to start Docker container.")
  }

  return { id: result.stdout.trim() }
}

async function checkRunning(idOrName: string): Promise<boolean> {
  const result = await runDockerCommand(["inspect", "-f", "{{.State.Running}}", idOrName], 10_000)
  return result.exitCode === 0 && result.stdout.trim() === "true"
}

export async function enterDockerMode(): Promise<DockerSessionStatus> {
  const config = getDockerConfig()
  try {
    const started = await startContainer(config)
    sessionEnabled = true
    containerId = started.id
    containerName = SESSION_CONTAINER_NAME
    lastError = null
  } catch (error) {
    sessionEnabled = false
    containerId = null
    containerName = null
    lastError = error instanceof Error ? error.message : "Failed to start Docker container."
  }
  return getDockerSessionStatus()
}

export async function exitDockerMode(): Promise<DockerSessionStatus> {
  if (containerName) {
    await removeContainer(containerName)
  }
  sessionEnabled = false
  containerId = null
  containerName = null
  lastError = null
  return getDockerSessionStatus()
}

export async function restartDockerMode(): Promise<DockerSessionStatus> {
  const wasEnabled = sessionEnabled
  await exitDockerMode()
  if (wasEnabled) {
    return enterDockerMode()
  }
  return getDockerSessionStatus()
}

export async function ensureDockerRunning(): Promise<DockerSessionStatus> {
  if (!sessionEnabled) {
    return getDockerSessionStatus()
  }
  if (containerId && (await checkRunning(containerId))) {
    return getDockerSessionStatus()
  }
  return enterDockerMode()
}

export function getDockerRuntimeConfig(): {
  config: DockerConfig | null
  containerId: string | null
} {
  if (!sessionEnabled) {
    return { config: null, containerId: null }
  }
  const config = { ...getDockerConfig(), enabled: true }
  return { config, containerId }
}
