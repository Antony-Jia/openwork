export interface ToolDefinition {
  name: string
  label: string
  description: string
  keyLabel?: string
  envVar?: string
  requiresKey?: boolean
}

export interface ToolInfo extends ToolDefinition {
  hasKey: boolean
}
