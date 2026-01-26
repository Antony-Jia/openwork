import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getOpenworkDir } from "../storage"

const TOOLS_CONFIG_FILE = join(getOpenworkDir(), "tools.json")

interface ToolConfigStore {
  [toolName: string]: {
    key?: string
    enabled?: boolean
  }
}

function readToolsConfig(): ToolConfigStore {
  if (!existsSync(TOOLS_CONFIG_FILE)) {
    return {}
  }

  try {
    const raw = readFileSync(TOOLS_CONFIG_FILE, "utf-8")
    const parsed = JSON.parse(raw) as ToolConfigStore
    return typeof parsed === "object" && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function writeToolsConfig(config: ToolConfigStore): void {
  const data = JSON.stringify(config, null, 2)
  writeFileSync(TOOLS_CONFIG_FILE, data)
}

export function getStoredToolKey(toolName: string): string | undefined {
  const config = readToolsConfig()
  return config[toolName]?.key
}

export function setStoredToolKey(toolName: string, key: string | null): void {
  const config = readToolsConfig()
  const existing = config[toolName] ?? {}
  const trimmed = key?.trim()

  if (!trimmed) {
    delete existing.key
  } else {
    existing.key = trimmed
  }

  if (!existing.key && existing.enabled === undefined) {
    delete config[toolName]
  } else {
    config[toolName] = existing
  }

  writeToolsConfig(config)
}

export function isToolEnabled(toolName: string): boolean {
  const config = readToolsConfig()
  const enabled = config[toolName]?.enabled
  return enabled ?? true
}

export function setToolEnabled(toolName: string, enabled: boolean): void {
  const config = readToolsConfig()
  const existing = config[toolName] ?? {}

  existing.enabled = enabled
  if (!existing.key && existing.enabled === undefined) {
    delete config[toolName]
  } else {
    config[toolName] = existing
  }

  writeToolsConfig(config)
}

export function resolveToolKey(toolName: string, envVarName?: string): string | undefined {
  const storedKey = getStoredToolKey(toolName)
  if (storedKey) {
    return storedKey
  }

  if (envVarName) {
    return process.env[envVarName]
  }

  return undefined
}
