import { randomUUID } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { SubagentConfig } from "./types"
import { getOpenworkDir } from "./storage"
import { logEntry, logExit } from "./logging"

const SUBAGENTS_FILE = join(getOpenworkDir(), "subagents.json")

function appendCurrentTime(prompt: string): string {
  const now = new Date()
  return `${prompt}\n\nCurrent time: ${now.toISOString()}\nCurrent year: ${now.getFullYear()}`
}

function readSubagentsFile(): SubagentConfig[] {
  if (!existsSync(SUBAGENTS_FILE)) {
    return []
  }
  try {
    const raw = readFileSync(SUBAGENTS_FILE, "utf-8")
    const parsed = JSON.parse(raw) as SubagentConfig[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSubagentsFile(subagents: SubagentConfig[]): void {
  const data = JSON.stringify(subagents, null, 2)
  writeFileSync(SUBAGENTS_FILE, data)
}

export function listSubagents(): SubagentConfig[] {
  logEntry("Subagents", "list")
  const result = readSubagentsFile()
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

  const subagents = readSubagentsFile()
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
    interruptOn: input.interruptOn ?? false
  }

  writeSubagentsFile([...subagents, created])
  logExit("Subagents", "create", { id: created.id, name: created.name })
  return created
}

export function updateSubagent(
  id: string,
  updates: Partial<Omit<SubagentConfig, "id">>
): SubagentConfig {
  logEntry("Subagents", "update", { id, updates: Object.keys(updates || {}) })
  const subagents = readSubagentsFile()
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

  subagents[index] = updated
  writeSubagentsFile(subagents)
  logExit("Subagents", "update", { id, name: updated.name })
  return updated
}

export function deleteSubagent(id: string): void {
  logEntry("Subagents", "delete", { id })
  const subagents = readSubagentsFile()
  const next = subagents.filter((agent) => agent.id !== id)
  writeSubagentsFile(next)
  logExit("Subagents", "delete", { id })
}
