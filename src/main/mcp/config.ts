import type { McpServerConfig, McpServerMode } from "../types"
import { getDb, markDbDirty } from "../db"

function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== "string" || !value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

export function listMcpConfigs(): McpServerConfig[] {
  const database = getDb()
  const stmt = database.prepare("SELECT * FROM mcp_servers")
  const servers: McpServerConfig[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>
    servers.push({
      id: String(row.id),
      name: String(row.name),
      mode: row.mode as McpServerMode,
      command: (row.command as string | null) ?? undefined,
      args: parseJson<string[]>(row.args),
      env: parseJson<Record<string, string>>(row.env),
      cwd: (row.cwd as string | null) ?? undefined,
      url: (row.url as string | null) ?? undefined,
      headers: parseJson<Record<string, string>>(row.headers),
      autoStart:
        row.auto_start === null || row.auto_start === undefined
          ? undefined
          : Boolean(row.auto_start),
      enabled: row.enabled === null || row.enabled === undefined ? undefined : Boolean(row.enabled)
    })
  }
  stmt.free()
  return servers
}

export function saveMcpConfigs(servers: McpServerConfig[]): void {
  const database = getDb()
  database.run("DELETE FROM mcp_servers")
  for (const server of servers) {
    database.run(
      `INSERT OR REPLACE INTO mcp_servers
       (id, name, mode, command, args, env, cwd, url, headers, auto_start, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        server.id,
        server.name,
        server.mode,
        server.command ?? null,
        server.args ? JSON.stringify(server.args) : null,
        server.env ? JSON.stringify(server.env) : null,
        server.cwd ?? null,
        server.url ?? null,
        server.headers ? JSON.stringify(server.headers) : null,
        server.autoStart === undefined ? null : server.autoStart ? 1 : 0,
        server.enabled === undefined ? null : server.enabled ? 1 : 0
      ]
    )
  }
  markDbDirty()
}
