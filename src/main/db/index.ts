import initSqlJs, { Database as SqlJsDatabase } from "sql.js"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { dirname, join } from "path"
import { getDbPath, getOpenworkDir } from "../storage"
import type { AppSettings, McpServerConfig, ProviderConfig, SubagentConfig } from "../types"

let db: SqlJsDatabase | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false

/**
 * Save database to disk (debounced)
 */
function saveToDisk(): void {
  if (!db) return

  dirty = true

  if (saveTimer) {
    clearTimeout(saveTimer)
  }

  saveTimer = setTimeout(() => {
    if (db && dirty) {
      const data = db.export()
      writeFileSync(getDbPath(), Buffer.from(data))
      dirty = false
    }
  }, 100)
}

export function markDbDirty(): void {
  saveToDisk()
}

/**
 * Force immediate save
 */
export async function flush(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (db && dirty) {
    const data = db.export()
    writeFileSync(getDbPath(), Buffer.from(data))
    dirty = false
  }
}

export function getDb(): SqlJsDatabase {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.")
  }
  return db
}

export async function initializeDatabase(): Promise<SqlJsDatabase> {
  const dbPath = getDbPath()
  console.log("Initializing database at:", dbPath)

  const SQL = await initSqlJs()

  // Load existing database if it exists
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    // Ensure directory exists
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    db = new SQL.Database()
  }

  // Create tables if they don't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS threads (
      thread_id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      metadata TEXT,
      status TEXT DEFAULT 'idle',
      thread_values TEXT,
      title TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      thread_id TEXT REFERENCES threads(thread_id) ON DELETE CASCADE,
      assistant_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      status TEXT,
      metadata TEXT,
      kwargs TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS assistants (
      assistant_id TEXT PRIMARY KEY,
      graph_id TEXT NOT NULL,
      name TEXT,
      model TEXT DEFAULT 'claude-sonnet-4-5-20250929',
      config TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      data TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS provider_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      data TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS tool_config (
      name TEXT PRIMARY KEY,
      enabled INTEGER,
      key TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      command TEXT,
      args TEXT,
      env TEXT,
      cwd TEXT,
      url TEXT,
      headers TEXT,
      auto_start INTEGER,
      enabled INTEGER
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS subagents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      model TEXT,
      tools TEXT,
      middleware TEXT,
      interrupt_on INTEGER,
      enabled INTEGER
    )
  `)

  db.run(`CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_runs_thread_id ON runs(thread_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)`)

  migrateConfigFromJson(db)
  saveToDisk()

  console.log("Database initialized successfully")
  return db
}

export function closeDatabase(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (db) {
    // Save any pending changes
    if (dirty) {
      const data = db.export()
      writeFileSync(getDbPath(), Buffer.from(data))
    }
    db.close()
    db = null
  }
}

// Helper functions for common operations

function readLegacyJson<T>(filename: string): T | null {
  const filePath = join(getOpenworkDir(), filename)
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function tableHasRows(database: SqlJsDatabase, tableName: string): boolean {
  const stmt = database.prepare(`SELECT 1 FROM ${tableName} LIMIT 1`)
  const has = stmt.step()
  stmt.free()
  return has
}

function getMetaValue(database: SqlJsDatabase, key: string): string | null {
  const stmt = database.prepare("SELECT value FROM meta WHERE key = ?")
  stmt.bind([key])
  const hasRow = stmt.step()
  if (!hasRow) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject() as { value?: string | null }
  stmt.free()
  return row.value ?? null
}

function setMetaValue(database: SqlJsDatabase, key: string, value: string): void {
  database.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value])
}

function migrateConfigFromJson(database: SqlJsDatabase): void {
  const migrated = getMetaValue(database, "json_migrated")
  if (migrated === "1") {
    return
  }

  let wrote = false

  if (!tableHasRows(database, "app_settings")) {
    const settings = readLegacyJson<AppSettings>("settings.json")
    if (settings) {
      database.run("INSERT OR REPLACE INTO app_settings (id, data) VALUES (1, ?)", [
        JSON.stringify(settings)
      ])
      wrote = true
    }
  }

  if (!tableHasRows(database, "provider_config")) {
    const config = readLegacyJson<ProviderConfig>("provider-config.json")
    if (config) {
      database.run("INSERT OR REPLACE INTO provider_config (id, data) VALUES (1, ?)", [
        JSON.stringify(config)
      ])
      wrote = true
    }
  }

  if (!tableHasRows(database, "tool_config")) {
    const tools = readLegacyJson<
      Record<string, { key?: string | null; enabled?: boolean | null }>
    >("tools.json")
    if (tools && typeof tools === "object") {
      for (const [name, entry] of Object.entries(tools)) {
        if (!name) continue
        const enabled =
          entry?.enabled === undefined || entry?.enabled === null ? null : entry.enabled ? 1 : 0
        const key = entry?.key ?? null
        database.run("INSERT OR REPLACE INTO tool_config (name, enabled, key) VALUES (?, ?, ?)", [
          name,
          enabled,
          key
        ])
        wrote = true
      }
    }
  }

  if (!tableHasRows(database, "mcp_servers")) {
    const mcp = readLegacyJson<{ servers?: McpServerConfig[] }>("mcp.json")
    const servers = Array.isArray(mcp?.servers) ? mcp?.servers : []
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
      wrote = true
    }
  }

  if (!tableHasRows(database, "subagents")) {
    const subagents = readLegacyJson<SubagentConfig[]>("subagents.json")
    if (Array.isArray(subagents)) {
      for (const subagent of subagents) {
        database.run(
          `INSERT OR REPLACE INTO subagents
           (id, name, description, system_prompt, model, tools, middleware, interrupt_on, enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            subagent.id,
            subagent.name,
            subagent.description,
            subagent.systemPrompt,
            subagent.model ?? null,
            subagent.tools ? JSON.stringify(subagent.tools) : null,
            subagent.middleware ? JSON.stringify(subagent.middleware) : null,
            subagent.interruptOn === undefined ? null : subagent.interruptOn ? 1 : 0,
            subagent.enabled === undefined ? null : subagent.enabled ? 1 : 0
          ]
        )
        wrote = true
      }
    }
  }

  setMetaValue(database, "json_migrated", "1")
  if (wrote) {
    saveToDisk()
  }
}

/** Raw thread row from SQLite database (timestamps as numbers, metadata as JSON string) */
export interface ThreadRow {
  thread_id: string
  created_at: number
  updated_at: number
  metadata: string | null
  status: string
  thread_values: string | null
  title: string | null
}

export function getAllThreads(): ThreadRow[] {
  const database = getDb()
  const stmt = database.prepare("SELECT * FROM threads ORDER BY updated_at DESC")
  const threads: ThreadRow[] = []

  while (stmt.step()) {
    threads.push(stmt.getAsObject() as unknown as ThreadRow)
  }
  stmt.free()

  return threads
}

export function getThread(threadId: string): ThreadRow | null {
  const database = getDb()
  const stmt = database.prepare("SELECT * FROM threads WHERE thread_id = ?")
  stmt.bind([threadId])

  if (!stmt.step()) {
    stmt.free()
    return null
  }

  const thread = stmt.getAsObject() as unknown as ThreadRow
  stmt.free()
  return thread
}

export function createThread(threadId: string, metadata?: Record<string, unknown>): ThreadRow {
  const database = getDb()
  const now = Date.now()

  database.run(
    `INSERT INTO threads (thread_id, created_at, updated_at, metadata, status)
     VALUES (?, ?, ?, ?, ?)`,
    [threadId, now, now, metadata ? JSON.stringify(metadata) : null, "idle"]
  )

  saveToDisk()

  return {
    thread_id: threadId,
    created_at: now,
    updated_at: now,
    metadata: metadata ? JSON.stringify(metadata) : null,
    status: "idle",
    thread_values: null,
    title: null
  }
}

export function updateThread(
  threadId: string,
  updates: Partial<Omit<ThreadRow, "thread_id" | "created_at">>
): ThreadRow | null {
  const database = getDb()
  const existing = getThread(threadId)

  if (!existing) return null

  const now = Date.now()
  const setClauses: string[] = ["updated_at = ?"]
  const values: (string | number | null)[] = [now]

  if (updates.metadata !== undefined) {
    setClauses.push("metadata = ?")
    values.push(
      typeof updates.metadata === "string" ? updates.metadata : JSON.stringify(updates.metadata)
    )
  }
  if (updates.status !== undefined) {
    setClauses.push("status = ?")
    values.push(updates.status)
  }
  if (updates.thread_values !== undefined) {
    setClauses.push("thread_values = ?")
    values.push(updates.thread_values)
  }
  if (updates.title !== undefined) {
    setClauses.push("title = ?")
    values.push(updates.title)
  }

  values.push(threadId)

  database.run(`UPDATE threads SET ${setClauses.join(", ")} WHERE thread_id = ?`, values)

  saveToDisk()

  return getThread(threadId)
}

export function deleteThread(threadId: string): void {
  const database = getDb()
  database.run("DELETE FROM threads WHERE thread_id = ?", [threadId])
  saveToDisk()
}
