import { getDb, markDbDirty } from "../db"

interface ToolConfigStore {
  [toolName: string]: {
    key?: string
    enabled?: boolean
  }
}

function readToolsConfig(): ToolConfigStore {
  const database = getDb()
  const stmt = database.prepare("SELECT name, enabled, key FROM tool_config")
  const config: ToolConfigStore = {}
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      name?: string
      enabled?: number | null
      key?: string | null
    }
    const name = row.name
    if (!name) continue
    const enabled =
      row.enabled === null || row.enabled === undefined ? undefined : Boolean(row.enabled)
    const key = row.key ?? undefined
    config[name] = { enabled, key }
  }
  stmt.free()
  return config
}

function writeToolsConfig(config: ToolConfigStore): void {
  const database = getDb()
  database.run("DELETE FROM tool_config")
  for (const [name, entry] of Object.entries(config)) {
    const enabled =
      entry.enabled === undefined || entry.enabled === null ? null : entry.enabled ? 1 : 0
    const key = entry.key ?? null
    database.run("INSERT OR REPLACE INTO tool_config (name, enabled, key) VALUES (?, ?, ?)", [
      name,
      enabled,
      key
    ])
  }
  markDbDirty()
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
