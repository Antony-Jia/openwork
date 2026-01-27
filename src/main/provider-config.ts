import type { ProviderConfig } from "./types"
import { getDb, markDbDirty } from "./db"

export function getProviderConfig(): ProviderConfig | null {
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
    return JSON.parse(row.data ?? "") as ProviderConfig
  } catch {
    return null
  }
}

export function setProviderConfig(config: ProviderConfig): void {
  const database = getDb()
  database.run("INSERT OR REPLACE INTO provider_config (id, data) VALUES (1, ?)", [
    JSON.stringify(config, null, 2)
  ])
  markDbDirty()
}

export function deleteProviderConfig(): void {
  const database = getDb()
  database.run("DELETE FROM provider_config WHERE id = 1")
  markDbDirty()
}
