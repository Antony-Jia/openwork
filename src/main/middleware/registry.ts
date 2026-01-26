import { createPatchToolCallsMiddleware } from "deepagents"
import type { MiddlewareDefinition } from "../types"

const middlewareRegistry = [
  {
    definition: {
      id: "patch_tool_calls",
      label: "Patch Tool Calls",
      description: "Ensure tool calls are paired with tool results."
    },
    factory: () => createPatchToolCallsMiddleware()
  }
]

export const middlewareDefinitions: MiddlewareDefinition[] = middlewareRegistry.map(
  (entry) => entry.definition
)

const middlewareFactoryMap = new Map(
  middlewareRegistry.map((entry) => [entry.definition.id, entry.factory])
)

export function resolveMiddlewareById(ids?: string[]): Array<unknown> | undefined {
  if (!ids) return undefined
  if (ids.length === 0) return []

  return ids
    .map((id) => middlewareFactoryMap.get(id))
    .filter((factory): factory is NonNullable<typeof factory> => !!factory)
    .map((factory) => factory())
}
