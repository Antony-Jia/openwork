export interface ToolDefinition {
  name: string
  label: string
  description: string
  keyLabel?: string
  envVar?: string
}

export interface ToolInfo extends ToolDefinition {
  hasKey: boolean
}
