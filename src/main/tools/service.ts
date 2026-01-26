import { isToolEnabled, resolveToolKey, setStoredToolKey, setToolEnabled } from "./config"
import { toolDefinitions, toolInstanceMap } from "./registry"
import type { ToolInfo } from "../types"

function toToolInfo(definition: (typeof toolDefinitions)[number]): ToolInfo {
  const hasKey = !!resolveToolKey(definition.name, definition.envVar)
  const enabled = isToolEnabled(definition.name)
  return {
    ...definition,
    hasKey,
    enabled
  }
}

export function listTools(): ToolInfo[] {
  console.log("[Tools] listTools called, toolDefinitions count:", toolDefinitions.length)
  const result = toolDefinitions.map((definition) => toToolInfo(definition))
  console.log("[Tools] Returning tools:", result.map((t) => t.name))
  return result
}

export function getEnabledToolInstances() {
  return toolDefinitions
    .filter((definition) => isToolEnabled(definition.name))
    .map((definition) => toolInstanceMap.get(definition.name))
    .filter((instance): instance is NonNullable<typeof instance> => !!instance)
}

export function resolveToolInstancesByName(names?: string[]): Array<unknown> | undefined {
  if (!names) return undefined
  if (names.length === 0) return []

  const instances = names
    .filter((name) => isToolEnabled(name))
    .map((name) => toolInstanceMap.get(name))
    .filter((instance): instance is NonNullable<typeof instance> => !!instance)

  return instances.length > 0 ? instances : undefined
}

export function updateToolKey(toolName: string, key: string | null): ToolInfo {
  const definition = toolDefinitions.find((tool) => tool.name === toolName)
  if (!definition) {
    throw new Error("Tool not found.")
  }

  setStoredToolKey(toolName, key)
  return toToolInfo(definition)
}

export function updateToolEnabled(toolName: string, enabled: boolean): ToolInfo {
  const definition = toolDefinitions.find((tool) => tool.name === toolName)
  if (!definition) {
    throw new Error("Tool not found.")
  }

  setToolEnabled(toolName, enabled)
  return toToolInfo(definition)
}
