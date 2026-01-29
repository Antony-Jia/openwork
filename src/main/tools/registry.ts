import { internetSearchDefinition, internetSearchTool } from "./internet-search"
import { sendEmailDefinition, sendEmailTool } from "./send-email"
import type { ToolDefinition } from "../types"

export const toolRegistry: Array<{
  definition: ToolDefinition
  instance: unknown
}> = [
  { definition: internetSearchDefinition, instance: internetSearchTool },
  { definition: sendEmailDefinition, instance: sendEmailTool }
]

export const toolDefinitions: ToolDefinition[] = toolRegistry.map((entry) => entry.definition)

export const toolInstances = toolRegistry.map((entry) => entry.instance)

export const toolInstanceMap = new Map(
  toolRegistry.map((entry) => [entry.definition.name, entry.instance])
)
