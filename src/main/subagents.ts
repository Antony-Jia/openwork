import { randomUUID } from "node:crypto"
import type { SubagentConfig } from "./types"
import { logEntry, logExit } from "./logging"
import { getDb, markDbDirty } from "./db"

function appendCurrentTime(prompt: string): string {
  const now = new Date()
  return `${prompt}\n\nCurrent time: ${now.toISOString()}\nCurrent year: ${now.getFullYear()}`
}

function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== "string" || !value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

export function listSubagents(): SubagentConfig[] {
  logEntry("Subagents", "list")
  const database = getDb()
  const stmt = database.prepare("SELECT * FROM subagents")
  const result: SubagentConfig[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>
    result.push({
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      systemPrompt: String(row.system_prompt),
      model: (row.model as string | null) ?? undefined,
      tools: parseJson<string[]>(row.tools),
      middleware: parseJson<string[]>(row.middleware),
      interruptOn:
        row.interrupt_on === null || row.interrupt_on === undefined
          ? undefined
          : Boolean(row.interrupt_on),
      enabled: row.enabled === null || row.enabled === undefined ? undefined : Boolean(row.enabled)
    })
  }
  stmt.free()
  logExit("Subagents", "list", { count: result.length })
  return result
}

export function createSubagent(input: Omit<SubagentConfig, "id">): SubagentConfig {
  logEntry("Subagents", "create", { name: input.name, toolCount: input.tools?.length ?? 0 })
  if (!input.name?.trim()) {
    throw new Error("Subagent name is required.")
  }
  if (!input.description?.trim()) {
    throw new Error("Subagent description is required.")
  }
  if (!input.systemPrompt?.trim()) {
    throw new Error("Subagent system prompt is required.")
  }

  const subagents = listSubagents()
  const nameExists = subagents.some(
    (agent) => agent.name.toLowerCase() === input.name.toLowerCase()
  )
  if (nameExists) {
    throw new Error(`Subagent name "${input.name}" already exists.`)
  }

  const created: SubagentConfig = {
    id: randomUUID(),
    name: input.name.trim(),
    description: input.description.trim(),
    systemPrompt: appendCurrentTime(input.systemPrompt.trim()),
    model: input.model,
    tools: input.tools,
    middleware: input.middleware,
    interruptOn: input.interruptOn ?? false,
    enabled: input.enabled ?? true
  }

  const database = getDb()
  database.run(
    `INSERT OR REPLACE INTO subagents
     (id, name, description, system_prompt, model, tools, middleware, interrupt_on, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      created.id,
      created.name,
      created.description,
      created.systemPrompt,
      created.model ?? null,
      created.tools ? JSON.stringify(created.tools) : null,
      created.middleware ? JSON.stringify(created.middleware) : null,
      created.interruptOn === undefined ? null : created.interruptOn ? 1 : 0,
      created.enabled === undefined ? null : created.enabled ? 1 : 0
    ]
  )
  markDbDirty()
  logExit("Subagents", "create", { id: created.id, name: created.name })
  return created
}

export function updateSubagent(
  id: string,
  updates: Partial<Omit<SubagentConfig, "id">>
): SubagentConfig {
  logEntry("Subagents", "update", { id, updates: Object.keys(updates || {}) })
  const subagents = listSubagents()
  const index = subagents.findIndex((agent) => agent.id === id)
  if (index < 0) {
    throw new Error("Subagent not found.")
  }

  const nextName = updates.name?.trim()
  if (nextName) {
    const nameExists = subagents.some(
      (agent) => agent.id !== id && agent.name.toLowerCase() === nextName.toLowerCase()
    )
    if (nameExists) {
      throw new Error(`Subagent name "${nextName}" already exists.`)
    }
  }

  const current = subagents[index]
  const nextSystemPrompt = updates.systemPrompt?.trim()
  const updated: SubagentConfig = {
    ...current,
    ...updates,
    name: nextName ?? current.name,
    description: updates.description?.trim() ?? current.description,
    systemPrompt:
      updates.systemPrompt === undefined
        ? current.systemPrompt
        : appendCurrentTime(nextSystemPrompt ?? "")
  }

  const database = getDb()
  database.run(
    `INSERT OR REPLACE INTO subagents
     (id, name, description, system_prompt, model, tools, middleware, interrupt_on, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      updated.id,
      updated.name,
      updated.description,
      updated.systemPrompt,
      updated.model ?? null,
      updated.tools ? JSON.stringify(updated.tools) : null,
      updated.middleware ? JSON.stringify(updated.middleware) : null,
      updated.interruptOn === undefined ? null : updated.interruptOn ? 1 : 0,
      updated.enabled === undefined ? null : updated.enabled ? 1 : 0
    ]
  )
  markDbDirty()
  logExit("Subagents", "update", { id, name: updated.name })
  return updated
}

export function deleteSubagent(id: string): void {
  logEntry("Subagents", "delete", { id })
  const database = getDb()
  database.run("DELETE FROM subagents WHERE id = ?", [id])
  markDbDirty()
  logExit("Subagents", "delete", { id })
}
