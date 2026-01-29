// Re-export types from electron for use in renderer
export type ThreadStatus = "idle" | "busy" | "interrupted" | "error"
export type ThreadMode = "default" | "ralph" | "email"

export interface Thread {
  thread_id: string
  created_at: Date
  updated_at: Date
  metadata?: Record<string, unknown>
  status: ThreadStatus
  thread_values?: Record<string, unknown>
  title?: string
}

export interface RalphState {
  phase: "init" | "awaiting_confirm" | "running" | "done"
  iterations?: number
}

export type RalphLogRole = "user" | "ai" | "tool" | "tool_call"

export interface RalphLogEntry {
  id: string
  ts: string
  threadId: string
  runId: string
  iteration?: number
  phase?: RalphState["phase"]
  role: RalphLogRole
  content: string
  messageId?: string
  toolCallId?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
}

export type RunStatus = "pending" | "running" | "error" | "success" | "interrupted"

export interface Run {
  run_id: string
  thread_id: string
  assistant_id?: string
  created_at: Date
  updated_at: Date
  status: RunStatus
  metadata?: Record<string, unknown>
}

// Provider configuration
export type ProviderId = "anthropic" | "openai" | "google" | "ollama"

export interface Provider {
  id: ProviderId
  name: string
  hasApiKey: boolean
}

export interface ModelConfig {
  id: string
  name: string
  provider: ProviderId
  model: string
  description?: string
  available: boolean
}

// New simplified provider configuration types
export type SimpleProviderId = "ollama" | "openai-compatible"

export interface DockerMount {
  hostPath: string
  containerPath: string
  readOnly?: boolean
}

export interface DockerPort {
  host: number
  container: number
  protocol?: "tcp" | "udp"
}

export interface DockerResources {
  cpu?: number
  memoryMb?: number
}

export interface DockerConfig {
  enabled: boolean
  image: string
  mounts: DockerMount[]
  resources?: DockerResources
  ports?: DockerPort[]
}

export interface DockerSessionStatus {
  enabled: boolean
  running: boolean
  containerId?: string
  containerName?: string
  error?: string
}

export interface OllamaConfig {
  type: "ollama"
  url: string // e.g., "http://localhost:11434"
  model: string // e.g., "qwen2.5:7b"
}

export interface OpenAICompatibleConfig {
  type: "openai-compatible"
  url: string // e.g., "https://api.deepseek.com"
  apiKey: string
  model: string // e.g., "deepseek-chat"
}

export type ProviderConfig = OllamaConfig | OpenAICompatibleConfig

// Custom subagent configuration
export interface SubagentConfig {
  id: string
  name: string
  description: string
  systemPrompt: string
  model?: string
  tools?: string[]
  middleware?: string[]
  interruptOn?: boolean
  enabled?: boolean
}

// Skill metadata for management UI
export interface SkillItem {
  name: string
  description: string
  path: string
  source?: string
  enabled: boolean
}

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
  enabled: boolean
}

export interface ToolKeyUpdateParams {
  name: string
  key: string | null
}

export interface ToolEnableUpdateParams {
  name: string
  enabled: boolean
}

// App settings
export interface EmailSmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}

export interface EmailImapConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}

export interface EmailSettings {
  enabled: boolean
  from: string
  to: string[]
  smtp: EmailSmtpConfig
  imap: EmailImapConfig
  taskTag: string
  pollIntervalSec: number
}

export interface AppSettings {
  ralphIterations: number
  email: EmailSettings
  defaultWorkspacePath?: string | null
  dockerConfig?: DockerConfig
}

export interface SettingsUpdateParams {
  updates: Partial<AppSettings>
}

// MCP configuration
export type McpServerMode = "local" | "remote"

export interface McpServerConfig {
  id: string
  name: string
  mode: McpServerMode
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  autoStart?: boolean
  enabled?: boolean
}

export interface McpServerStatus {
  running: boolean
  toolsCount: number
  lastError?: string | null
}

export interface McpServerListItem {
  config: McpServerConfig
  status: McpServerStatus
}

export interface McpServerCreateParams extends Omit<McpServerConfig, "id"> {}

export interface McpServerUpdateParams {
  id: string
  updates: Partial<Omit<McpServerConfig, "id">>
}

export interface McpToolInfo {
  serverId: string
  serverName: string
  toolName: string
  fullName: string
  description?: string
}

export interface MiddlewareDefinition {
  id: string
  label: string
  description?: string
}

// Subagent types (from deepagentsjs)
export interface Subagent {
  id: string
  name: string
  description: string
  status: "pending" | "running" | "completed" | "failed"
  startedAt?: Date
  completedAt?: Date
  // Used to correlate task tool calls with their responses
  toolCallId?: string
  // Type of subagent (e.g., 'general-purpose', 'correctness-checker', 'final-reviewer')
  subagentType?: string
}

export type StreamEvent =
  | { type: "message"; message: Message }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_result"; toolResult: ToolResult }
  | { type: "interrupt"; request: HITLRequest }
  | { type: "token"; token: string }
  | { type: "todos"; todos: Todo[] }
  | { type: "workspace"; files: FileInfo[]; path: string }
  | { type: "subagents"; subagents: Subagent[] }
  | { type: "done"; result: unknown }
  | { type: "error"; error: string }

export interface Message {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string | ContentBlock[]
  tool_calls?: ToolCall[]
  // For tool messages - links result to its tool call
  tool_call_id?: string
  // For tool messages - the name of the tool
  name?: string
  created_at: Date
}

export interface ContentBlock {
  type: "text" | "image" | "tool_use" | "tool_result"
  text?: string
  tool_use_id?: string
  name?: string
  input?: unknown
  content?: string
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  tool_call_id: string
  content: string | unknown
  is_error?: boolean
}

export interface HITLRequest {
  id: string
  tool_call: ToolCall
  allowed_decisions: HITLDecision["type"][]
}

export interface HITLDecision {
  type: "approve" | "reject" | "edit"
  tool_call_id: string
  edited_args?: Record<string, unknown>
  feedback?: string
}

export interface Todo {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
}

export interface FileInfo {
  path: string
  is_dir?: boolean
  size?: number
  modified_at?: string
}

export interface GrepMatch {
  path: string
  line: number
  text: string
}
