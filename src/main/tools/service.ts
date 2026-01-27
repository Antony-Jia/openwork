import { isToolEnabled, resolveToolKey, setStoredToolKey, setToolEnabled } from "./config"
import { toolDefinitions, toolInstanceMap } from "./registry"
import { getRunningMcpToolInstanceMap } from "../mcp/service"
import type { ToolInfo } from "../types"
import { logEntry, logExit, summarizeList } from "../logging"

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
  logEntry("Tools", "listTools", { definitions: toolDefinitions.length })
  const result = toolDefinitions.map((definition) => toToolInfo(definition))
  logExit("Tools", "listTools", summarizeList(result.map((t) => t.name)))
  return result
}

export function getEnabledToolInstances() {
  const enabled = toolDefinitions
    .filter((definition) => isToolEnabled(definition.name))
    .map((definition) => toolInstanceMap.get(definition.name))
    .filter((instance): instance is NonNullable<typeof instance> => !!instance)
  logExit("Tools", "getEnabledToolInstances", { count: enabled.length })
  return enabled
}

export function getEnabledToolNames(): string[] {
  const names = toolDefinitions
    .filter((definition) => isToolEnabled(definition.name))
    .map((definition) => definition.name)
  logExit("Tools", "getEnabledToolNames", summarizeList(names))
  return names
}

export function resolveToolInstancesByName(names?: string[]): Array<unknown> | undefined {
  if (!names) {
    logExit("Tools", "resolveToolInstancesByName", { requested: 0, resolved: 0 })
    return undefined
  }
  if (names.length === 0) {
    logExit("Tools", "resolveToolInstancesByName", { requested: 0, resolved: 0 })
    return []
  }

  const mcpToolMap = getRunningMcpToolInstanceMap()
  // For subagents, we resolve tools by name directly without checking global enabled state.
  // The subagent configuration explicitly specifies which tools to use.
  const instances = names
    .map((name) => (name.startsWith("mcp.") ? mcpToolMap.get(name) : toolInstanceMap.get(name)))
    .filter((instance): instance is NonNullable<typeof instance> => !!instance)

  logExit("Tools", "resolveToolInstancesByName", {
    requested: names.length,
    resolved: instances.length
  })
  return instances.length > 0 ? instances : undefined
}

export function updateToolKey(toolName: string, key: string | null): ToolInfo {
  const definition = toolDefinitions.find((tool) => tool.name === toolName)
  if (!definition) {
    throw new Error("Tool not found.")
  }

  logEntry("Tools", "updateToolKey", { toolName, hasKey: !!key })
  setStoredToolKey(toolName, key)
  const result = toToolInfo(definition)
  logExit("Tools", "updateToolKey", { toolName, hasKey: result.hasKey })
  return result
}

export function updateToolEnabled(toolName: string, enabled: boolean): ToolInfo {
  const definition = toolDefinitions.find((tool) => tool.name === toolName)
  if (!definition) {
    throw new Error("Tool not found.")
  }

  logEntry("Tools", "updateToolEnabled", { toolName, enabled })
  setToolEnabled(toolName, enabled)
  const result = toToolInfo(definition)
  logExit("Tools", "updateToolEnabled", { toolName, enabled: result.enabled })
  return result
}
