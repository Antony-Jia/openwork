import type { ProviderConfig, ProviderState, SimpleProviderId } from "./types"
import { getDb, markDbDirty } from "./db"

function isSimpleProviderId(value: unknown): value is SimpleProviderId {
  return value === "ollama" || value === "openai-compatible" || value === "multimodal"
}

function normalizeProviderState(value: unknown): ProviderState | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if ("active" in record && "configs" in record) {
    const active = record.active
    const configs = record.configs
    if (!isSimpleProviderId(active) || !configs || typeof configs !== "object") {
      return null
    }
    return { active, configs: configs as ProviderState["configs"] }
  }
  if ("type" in record && typeof record.type === "string") {
    const legacy = record as unknown as ProviderConfig
    if (!isSimpleProviderId(legacy.type)) return null
    return {
      active: legacy.type,
      configs: { [legacy.type]: legacy }
    }
  }
  return null
}

export function getProviderState(): ProviderState | null {
  const database = getDb()
  const stmt = database.prepare("SELECT data FROM provider_config WHERE id = 1")
  const hasRow = stmt.step()
  if (!hasRow) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject() as { data?: string }
  stmt.free()
  try {
    const parsed = JSON.parse(row.data ?? "")
    return normalizeProviderState(parsed)
  } catch {
    return null
  }
}

export function setProviderState(state: ProviderState): void {
  const database = getDb()
  database.run("INSERT OR REPLACE INTO provider_config (id, data) VALUES (1, ?)", [
    JSON.stringify(state, null, 2)
  ])
  markDbDirty()
}

export function getProviderConfig(): ProviderConfig | null {
  const state = getProviderState()
  if (!state) return null
  return state.configs[state.active] ?? null
}

export function setProviderConfig(config: ProviderConfig): void {
  setProviderState({ active: config.type, configs: { [config.type]: config } })
}

export function deleteProviderConfig(): void {
  const database = getDb()
  database.run("DELETE FROM provider_config WHERE id = 1")
  markDbDirty()
}
